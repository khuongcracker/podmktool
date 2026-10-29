// Podmktool backend — auth + proxy AI + đo usage.
//
// Vì sao có backend (trước đây frontend-only): key của công ty KHÔNG thể nằm
// trong browser. Bất kỳ ai mở DevTools cũng lấy được và xài bằng tiền công ty.
// Có backend rồi thì mới đo được usage thật của từng người.
import express from 'express'
import cookieParser from 'cookie-parser'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  createSession, endSession, listUsers, myHistory,
  sessionReport, usageReport,
  createUser, setUserActive, setUserPassword, setUserRole, deleteUser,
  countActiveAdmins, findUser,
} from './db.js'
import {
  requireAuth, requireAdmin, login, newSessionId,
  setSessionCookie, clearSessionCookie, readSid, SESSION_IDLE_MIN,
  hashPassword, generatePassword,
} from './auth.js'
import { makeProxy, inflightStats } from './proxy.js'
import { loginBlocked, loginFailed, loginOk } from './ratelimit.js'
import { fetchPage, fetchImage } from './page.js'
import { openaiImageHandler } from './openaiImage.js'
import { costOf, isPricingConfigured } from './pricing.js'

const app = express()
const PORT = Number(process.env.PORT || 8787)

/* ---------------- danh tính bản chạy ----------------
   Bản local và bản deploy trông y hệt nhau trên màn hình, mà dữ liệu thì tách
   hẳn: DB local nằm ở ./data/app.db, DB deploy nằm trên volume /data. Mở hai
   tab cạnh nhau rồi thao tác nhầm bản là chuyện sớm muộn — nhất là mấy việc
   không lùi được như xoá tài khoản. Nên server tự khai mình là ai, frontend
   đóng dấu lên tận thanh tiêu đề và tên tab trình duyệt.

   Nhận diện: Railway tự set RAILWAY_ENVIRONMENT. Muốn đè thì đặt APP_ENV. */
const APP_ENV = process.env.APP_ENV || (process.env.RAILWAY_ENVIRONMENT ? 'production' : 'local')
// RAILWAY_GIT_* chi co khi service noi thang GitHub. Service nay deploy bang
// `railway up` tu CLI nen khong co — doc APP_COMMIT/APP_BRANCH dat tay truoc,
// de con biet ban dang chay dung tu commit nao.
const COMMIT = (process.env.APP_COMMIT || process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 7)
const BRANCH = process.env.APP_BRANCH || process.env.RAILWAY_GIT_BRANCH || ''
// Đọc version từ package.json gốc — nguồn duy nhất, khỏi phải nhớ sửa hai chỗ.
let VERSION = ''
try {
  VERSION = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
  ).version || ''
} catch (_) { /* thiếu file thì thôi, không đáng chặn server */ }

const buildInfo = () => ({ env: APP_ENV, version: VERSION, commit: COMMIT, branch: BRANCH })

// Ảnh base64 đi trong body nên giới hạn mặc định 100kb của Express là quá nhỏ.
app.use(express.json({ limit: '25mb' }))
app.use(cookieParser())

const ipOf = (req) => req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip

/* ---------------- auth ---------------- */

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'Thiếu tài khoản hoặc mật khẩu.' })

  const ip = ipOf(req)
  const wait = loginBlocked(ip, username)
  if (wait) {
    return res.status(429).json({
      error: `Sai quá nhiều lần. Thử lại sau ${Math.ceil(wait / 60)} phút.`,
    })
  }

  const r = login(username, password)
  if (r.error) {
    loginFailed(ip, username)
    return res.status(401).json({ error: r.error })
  }
  loginOk(ip, username)

  const sid = newSessionId()
  createSession(sid, r.user.id, ipOf(req), req.headers['user-agent'])
  setSessionCookie(res, sid)
  res.json({ username: r.user.username, role: r.user.role, build: buildInfo() })
})

app.post('/api/logout', (req, res) => {
  const sid = readSid(req)
  if (sid) endSession(sid, 'logout')
  clearSessionCookie(res)
  res.json({ ok: true })
})

app.get('/api/me', requireAuth, (req, res) =>
  res.json({ username: req.user.username, role: req.user.role, build: buildInfo() })
)

/* ---------------- proxy AI ---------------- */

app.post('/api/gemini', requireAuth, makeProxy('gemini'))
app.post('/api/openai', requireAuth, makeProxy('openai'))
// Sinh ảnh OpenAI đi đường riêng: endpoint và định dạng khác hẳn Gemini.
app.post('/api/openai-image', requireAuth, openaiImageHandler)

/* ---------------- tải trang product ---------------- */

// Server fetch thay vì browser: không dính CORS, và model NÀO cũng đọc được
// cùng một nội dung (trước đây chỉ Gemini đọc URL được nhờ url_context).
app.get('/api/fetch-page', requireAuth, async (req, res) => {
  try {
    res.json(await fetchPage(String(req.query.url || '')))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.get('/api/fetch-image', requireAuth, async (req, res) => {
  try {
    res.json(await fetchImage(String(req.query.url || '')))
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

/* ---------------- lịch sử của chính mình ---------------- */

app.get('/api/my-history', requireAuth, (req, res) => {
  const rows = myHistory(req.user.id, Math.min(Number(req.query.limit) || 200, 1000))
  res.json({
    pricingConfigured: isPricingConfigured(),
    rows: rows.map((r) => ({ ...r, ...costOf(r) })),
  })
})

/* ---------------- báo cáo (admin) ---------------- */

// Mặc định 30 ngày gần nhất. Định dạng ngày: YYYY-MM-DD.
function range(req) {
  const to = req.query.to || new Date().toISOString().slice(0, 10)
  const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)
  return [`${from} 00:00:00`, `${to} 23:59:59`]
}

app.get('/api/admin/users', requireAuth, requireAdmin, (_req, res) =>
  res.json(listUsers())
)

// Tạo user mới.
app.post('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {}
  if (!username || !password) return res.status(400).json({ error: 'Thiếu username hoặc password.' })
  if (String(password).length < 6) return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự.' })
  if (findUser(username)) return res.status(409).json({ error: 'Username đã tồn tại.' })
  const { hash, salt } = hashPassword(String(password))
  createUser(String(username).trim(), hash, salt, role === 'admin' ? 'admin' : 'user')
  res.json({ ok: true })
})

// Import nhiều user 1 lượt. Mỗi dòng: username[,password][,role].
// Thiếu password -> dùng defaultPassword (admin phải nhập, không có mặc định).
// mode 'skip' (mặc định): user đã có thì bỏ qua.
// mode 'update': user đã có thì đặt lại mật khẩu (và vai trò nếu dòng ghi rõ) —
// để dán lại đúng danh sách cũ là cấp lại pass cả loạt, không phải sửa từng người.
app.post('/api/admin/users/bulk', requireAuth, requireAdmin, (req, res) => {
  const text = String(req.body?.text || '')
  const defPass = String(req.body?.defaultPassword || '')
  const mode = req.body?.mode === 'update' ? 'update' : 'skip'
  const results = []
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/[,\t;]+/).map((s) => s.trim())
    const username = parts[0]
    const password = parts[1] || defPass
    const role = parts[2] === 'admin' ? 'admin' : 'user'
    if (!username) { results.push({ line, status: 'error', error: 'thiếu username' }); continue }
    if (password.length < 6) { results.push({ username, status: 'error', error: 'pass < 6 ký tự' }); continue }
    const existing = findUser(username)
    if (existing) {
      if (mode !== 'update') { results.push({ username, status: 'exists' }); continue }
      try {
        const { hash, salt } = hashPassword(password)
        setUserPassword(username, hash, salt)
        // Chỉ đổi vai trò khi dòng đó GHI RÕ — dòng chỉ có username+pass mà âm
        // thầm hạ admin xuống user là mất quyền không ai biết.
        let roleChanged
        if (parts[2]) {
          if (role === 'user' && existing.role === 'admin' && existing.active && countActiveAdmins() <= 1) {
            results.push({ username, status: 'error', error: 'admin hoạt động cuối cùng — không hạ quyền' }); continue
          }
          setUserRole(username, role); roleChanged = role
        }
        results.push({ username, status: 'updated', role: roleChanged, usedDefault: !parts[1] })
      } catch (e) { results.push({ username, status: 'error', error: e.message }) }
      continue
    }
    try {
      const { hash, salt } = hashPassword(password)
      createUser(username, hash, salt, role)
      results.push({ username, status: 'created', role, usedDefault: !parts[1] })
    } catch (e) { results.push({ username, status: 'error', error: e.message }) }
  }
  res.json({
    results,
    created: results.filter((r) => r.status === 'created').length,
    updated: results.filter((r) => r.status === 'updated').length,
  })
})

// Hành động hàng loạt trên các tài khoản đã chọn: khoá/mở · đổi pass · đổi vai
// trò · xoá. Gộp 4 việc vào MỘT route vì luật chặn giống hệt nhau (không tự hại
// mình, không bỏ admin hoạt động cuối cùng) — tách thành 4 route là chép luật 4
// lần rồi lệch nhau. Thao tác 1 người cũng đi đường này, mảng 1 phần tử.
//
// Trả kết quả TỪNG DÒNG chứ không fail cả mẻ: 1 user hỏng không được chặn 20
// user còn lại, và admin cần biết đích danh ai không xong.
app.post('/api/admin/users/bulk-action', requireAuth, requireAdmin, (req, res) => {
  const { action, password, role, randomPassword } = req.body || {}
  const active = req.body?.active ? 1 : 0
  const usernames = Array.isArray(req.body?.usernames) ? req.body.usernames.map(String) : []

  if (!['active', 'password', 'role', 'delete'].includes(action))
    return res.status(400).json({ error: 'Hành động không hợp lệ.' })
  if (!usernames.length) return res.status(400).json({ error: 'Chưa chọn tài khoản nào.' })
  if (action === 'password' && !randomPassword && String(password || '').length < 6)
    return res.status(400).json({ error: 'Mật khẩu tối thiểu 6 ký tự.' })
  if (action === 'role' && role !== 'admin' && role !== 'user')
    return res.status(400).json({ error: 'Vai trò không hợp lệ.' })

  // Ba hành động này đều lấy đi một đường đăng nhập của admin.
  const takesAdminAway =
    action === 'delete' || (action === 'active' && !active) || (action === 'role' && role === 'user')

  const results = []
  for (const username of usernames) {
    const u = findUser(username)
    if (!u) { results.push({ username, status: 'error', error: 'không có tài khoản này' }); continue }
    if (takesAdminAway && u.id === req.user.id) {
      results.push({ username, status: 'skipped', error: 'không tự khoá/xoá/hạ quyền chính mình' }); continue
    }
    // Đếm lại mỗi vòng: chọn cả 2 admin thì người đầu xử lý xong, người thứ hai
    // mới đúng là "cuối cùng" và phải bị chặn.
    if (takesAdminAway && u.role === 'admin' && u.active && countActiveAdmins() <= 1) {
      results.push({ username, status: 'skipped', error: 'admin hoạt động cuối cùng' }); continue
    }

    try {
      if (action === 'delete') {
        deleteUser(username)
        results.push({ username, status: 'deleted' })
      } else if (action === 'active') {
        setUserActive(username, active)
        results.push({ username, status: active ? 'unlocked' : 'locked' })
      } else if (action === 'role') {
        setUserRole(username, role)
        results.push({ username, status: 'role', role })
      } else {
        const pw = randomPassword ? generatePassword() : String(password)
        const { hash, salt } = hashPassword(pw)
        setUserPassword(username, hash, salt)
        // Pass ngẫu nhiên trả về đúng MỘT lần ở đây — hash một chiều, không hỏi lại được.
        results.push({ username, status: 'password', password: randomPassword ? pw : undefined })
      }
    } catch (e) { results.push({ username, status: 'error', error: e.message }) }
  }

  res.json({ results, done: results.filter((r) => r.status !== 'error' && r.status !== 'skipped').length })
})

// Xuất CSV danh sách tài khoản (?usernames=a,b để chỉ xuất phần đã chọn).
// KHÔNG có cột mật khẩu: pass lưu bằng scrypt, một chiều, không đọc ngược được.
// File này để đối chiếu/bàn giao, KHÔNG phải bản sao lưu khôi phục đăng nhập.
app.get('/api/admin/users/export', requireAuth, requireAdmin, (req, res) => {
  const only = String(req.query.usernames || '').split(',').map((x) => x.trim()).filter(Boolean)
  const rows = listUsers().filter((r) => !only.length || only.includes(r.username))
  const esc = (v) => {
    const t = String(v ?? '')
    return /[",\r\n;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const csv = [
    ['username', 'role', 'active', 'created_at', 'logins', 'calls'].join(','),
    ...rows.map((r) =>
      [r.username, r.role, r.active ? 'active' : 'locked', r.created_at, r.logins, r.calls].map(esc).join(',')
    ),
  ].join('\r\n')
  const day = new Date().toISOString().slice(0, 10)
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename="pod-users-${day}.csv"`)
  // BOM để Excel trên Windows đọc đúng UTF-8 — thiếu nó là tiếng Việt vỡ hết.
  res.send('\uFEFF' + csv)
})

// Thời gian login/logout từng người.
app.get('/api/admin/sessions', requireAuth, requireAdmin, (req, res) => {
  const [from, to] = range(req)
  res.json(
    sessionReport(from, to).map((r) => ({
      ...r,
      seconds: r.seconds || 0,
      hours: Math.round(((r.seconds || 0) / 3600) * 100) / 100,
    }))
  )
})

// Số lượt gen + chi phí API từng người. Chi phí tính LÚC ĐỌC từ pricing.js,
// nên sửa bảng giá là số liệu cũ tự tính lại.
app.get('/api/admin/usage', requireAuth, requireAdmin, (req, res) => {
  const [from, to] = range(req)
  const rows = usageReport(from, to).map((r) => {
    const { cost, priced } = costOf(r)
    return { ...r, cost, priced }
  })
  res.json({
    pricingConfigured: isPricingConfigured(),
    // Tổng chỉ cộng phần ĐÃ có giá; số chưa cấu hình giá đếm riêng để không
    // ai nhìn nhầm tổng thiếu thành tổng đủ.
    totalCost: rows.filter((r) => r.priced).reduce((s, r) => s + r.cost, 0),
    unpricedRows: rows.filter((r) => !r.priced).length,
    rows,
  })
})

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    ...buildInfo(),
    uptimeSec: Math.round(process.uptime()),
    sessionIdleMin: SESSION_IDLE_MIN,
    geminiKey: Boolean(process.env.GEMINI_API_KEY),
    openaiKey: Boolean(process.env.OPENAI_API_KEY),
    pricingConfigured: isPricingConfigured(),
    image: inflightStats(),
  })
)

/* ---------------- phục vụ frontend (dist/) ---------------- */

// Deploy 1 dịch vụ: cùng backend phục vụ luôn frontend đã build → cùng origin,
// cookie phiên gửi kèm được, không cần vite proxy hay CORS. Chạy `npm run build`
// ở thư mục gốc để sinh ../dist trước khi deploy.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.resolve(__dirname, '..', 'dist')
// Asset băm hash (index-xxxx.js/css) bất biến → cache dài. index.html thì
// no-cache: mỗi lần load lấy bản mới nhất, tránh dính JS cũ hỏng sau deploy
// (đây là nguyên nhân "màn hình đen" nếu index.html bị cache).
app.use(express.static(DIST, {
  setHeaders: (res, p) => {
    if (p.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache')
    else if (p.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  },
}))
// SPA fallback: mọi GET không phải /api/* trả index.html để React Router lo.
// Không đụng /api/* → route không khớp vẫn trả 404 JSON đúng nghĩa.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
  res.setHeader('Cache-Control', 'no-cache')
  res.sendFile(path.join(DIST, 'index.html'))
})

// Bootstrap admin đầu tiên qua env (idempotent) — để tạo admin trên deploy mà
// không cần SSH vào container. Set ADMIN_USER + ADMIN_PASS, deploy, đăng nhập,
// rồi có thể xoá 2 biến (tài khoản đã nằm trên volume). Chỉ tạo nếu chưa có.
try {
  const bu = process.env.ADMIN_USER
  const bp = process.env.ADMIN_PASS
  if (bu && bp && !findUser(bu)) {
    const { hash, salt } = hashPassword(String(bp))
    createUser(String(bu).trim(), hash, salt, 'admin')
    console.log(`[server] bootstrap: tạo admin "${bu}"`)
  }
} catch (e) {
  console.warn('[server] bootstrap admin lỗi:', e.message)
}

app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`)
  console.log(`[server] bản: ${APP_ENV}${VERSION ? ' v' + VERSION : ''}${COMMIT ? ' · ' + COMMIT : ''} · DB ${process.env.DB_PATH || './data/app.db'}`)
  if (!process.env.GEMINI_API_KEY) console.warn('[server] ⚠️  chưa có GEMINI_API_KEY — /api/gemini sẽ trả 503')
  if (!isPricingConfigured()) console.warn('[server] ⚠️  pricing.js chưa điền giá — báo cáo chi phí sẽ báo "chưa cấu hình"')
})
