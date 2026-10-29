// Client gọi backend. Từ khi có backend, frontend KHÔNG còn giữ API key —
// mọi lượt gọi AI đi qua /api/<provider> và server mới là nơi gắn key.
// Cookie phiên là httpOnly nên JS ở đây không đọc được; `credentials: 'include'`
// để browser tự đính kèm.

const BASE = import.meta.env.VITE_API_BASE || ''

class AuthError extends Error {}
export { AuthError }

/* ---------------- huỷ lượt chạy ----------------
   Một lượt chạy pipeline = nhiều request nối nhau (đọc trang → phối cảnh →
   prompt) rồi N request sinh ảnh chạy song song. Gom tất cả vào MỘT
   AbortController để nút Huỷ cắt được cả chùm, thay vì phải luồn `signal` qua
   từng chữ ký hàm trong providers/gemini.js.

   Đếm theo tầng vì autoAll gọi generateAll bên trong: chỉ tầng ngoài cùng mới
   được tạo mới và mới được dọn. */
class CancelledError extends Error {
  constructor() { super('cancelled'); this.name = 'CancelledError' }
}
export { CancelledError }

let runAbort = null
let runDepth = 0

export function beginRun() {
  if (runDepth++ === 0) runAbort = new AbortController()
  return runAbort
}
export function endRun() {
  if (--runDepth <= 0) { runDepth = 0; runAbort = null }
}
export function abortRun() {
  runAbort?.abort()
  runAbort = null
  runDepth = 0
}
export const isCancelled = (e) => e instanceof CancelledError || e?.name === 'AbortError'

async function req(path, { method = 'GET', body, abortable = false, silentAuth = false } = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      // Chỉ request thuộc pipeline mới gắn signal — đừng để nút Huỷ giết luôn
      // /api/me hay /api/logout.
      signal: abortable ? runAbort?.signal : undefined,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw new CancelledError()
    throw new Error(`Không kết nối được backend (${BASE || 'cùng origin'}) — server đã chạy chưa? ${e.message}`)
  }

  let data = null
  try {
    data = await res.json()
  } catch (_) {
    /* một số phản hồi không có body */
  }

  // 401 = phiên hết hạn / đã đăng xuất. 403 kèm cờ authLost = tài khoản bị khoá
  // hoặc xoá giữa chừng. Cả hai đều là "phiên chết" nên xử một chỗ. CỐ Ý không
  // gom mọi 403 vào đây: 403 còn nghĩa "cần quyền admin", phiên vẫn sống.
  if (res.status === 401 || data?.authLost) {
    // Trước đây chỉ ba module provider mới gọi notifyAuthLost, nên khi phiên hết
    // hạn giữa chừng ở một lượt gọi KHÁC (đọc trang sản phẩm, tải ảnh từ link,
    // trang quản trị) thì app chỉ hiện một dòng chữ lỗi rồi đứng im — người dùng
    // phải tự F5 mới hiểu chuyện gì. Báo ngay tại đây thì mọi đường đều đá về
    // màn đăng nhập.
    const msg = data?.error || 'Phiên đã hết hạn — đăng nhập lại.'
    if (!silentAuth) notifyAuthLost(msg)
    throw new AuthError(msg)
  }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`)
  return data
}

/* ---------------- auth ---------------- */

export const apiLogin = (username, password) =>
  req('/api/login', { method: 'POST', body: { username, password } })

export const apiLogout = () => req('/api/logout', { method: 'POST' })

// Trả về null nếu chưa đăng nhập (thay vì ném lỗi) — dùng lúc mở app.
// silentAuth: 401 ở đây chỉ có nghĩa "chưa đăng nhập", không phải "vừa mất
// phiên" — báo động ở lượt dò lúc mở app là báo động giả.
export async function apiMe() {
  try {
    return await req('/api/me', { silentAuth: true })
  } catch (e) {
    if (e instanceof AuthError) return null
    throw e
  }
}

// Tải nội dung trang product ở phía server (không dính CORS, model nào cũng đọc được).
export const apiFetchPage = (url) => req(`/api/fetch-page?url=${encodeURIComponent(url)}`, { abortable: true })

// Tải ảnh qua backend — thay cho các proxy CORS bên thứ ba.
export const apiFetchImage = (url) => req(`/api/fetch-image?url=${encodeURIComponent(url)}`, { abortable: true })

export const apiMyHistory = (limit = 200) => req(`/api/my-history?limit=${limit}`)

// Danh tính bản chạy (local hay deploy). Công khai nên đọc được cả lúc chưa
// đăng nhập — màn đăng nhập cần đóng dấu trước, vì nhầm bản ngay từ lúc gõ mật
// khẩu là kiểu nhầm hay gặp nhất.
export const apiBuild = () => req('/api/health', { silentAuth: true })

export const apiAdminUsers = () => req('/api/admin/users')
export const apiAdminSessions = (q = '') => req(`/api/admin/sessions${q}`)
export const apiAdminUsage = (q = '') => req(`/api/admin/usage${q}`)
export const apiAdminCreateUser = (username, password, role) =>
  req('/api/admin/users', { method: 'POST', body: { username, password, role } })
export const apiAdminBulk = (text, defaultPassword, mode = 'skip') =>
  req('/api/admin/users/bulk', { method: 'POST', body: { text, defaultPassword, mode } })

// Một đường duy nhất cho khoá/mở · đổi pass · đổi vai trò · xoá, chạy trên
// mảng username. Thao tác 1 người cũng đi lối này (mảng 1 phần tử) để luật chặn
// phía server chỉ có một bản.
//   apiAdminBulkAction('active',   [...], { active: 0 })
//   apiAdminBulkAction('password', [...], { password: 'x' } | { randomPassword: true })
//   apiAdminBulkAction('role',     [...], { role: 'admin' })
//   apiAdminBulkAction('delete',   [...])
export const apiAdminBulkAction = (action, usernames, extra = {}) =>
  req('/api/admin/users/bulk-action', { method: 'POST', body: { action, usernames, ...extra } })

// Tải CSV danh sách tài khoản. Dùng fetch + blob thay vì thẻ <a href> để lỗi
// (hết phiên, mất quyền) hiện ngay trong panel, chứ không tải về một file JSON
// báo lỗi rồi admin mở ra mới biết.
export async function apiAdminExportUsers(usernames = []) {
  const q = usernames.length ? `?usernames=${encodeURIComponent(usernames.join(','))}` : ''
  const res = await fetch(`${BASE}/api/admin/users/export${q}`, { credentials: 'include' })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    if (res.status === 401 || data?.authLost) {
      const msg = data?.error || 'Phiên đã hết hạn — đăng nhập lại.'
      notifyAuthLost(msg)
      throw new AuthError(msg)
    }
    throw new Error(data?.error || `HTTP ${res.status}`)
  }
  const name =
    /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'pod-users.csv'
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  return name
}

/* ---------------- proxy AI ---------------- */

// Điểm vào duy nhất để gọi model. `provider` quyết định upstream nào.
export const callProvider = (provider, model, body) =>
  req(`/api/${provider}`, { method: 'POST', body: { model, body }, abortable: true })

// Sinh ảnh OpenAI: endpoint riêng, trả thẳng {mimeType, base64}.
export const apiOpenaiImage = (payload) =>
  req('/api/openai-image', { method: 'POST', body: payload, abortable: true })

/* ---------------- xử lý mất phiên ---------------- */

// Phiên hết hạn giữa chừng có thể xảy ra ở bất kỳ bước nào của pipeline.
// Thay vì nhét check vào từng call site, App đăng ký một handler ở đây.
let onAuthLost = () => {}
export const setAuthLostHandler = (fn) => { onAuthLost = fn }
// Mang theo lý do do server nói ("Tài khoản đã bị khoá." / "Phiên đã hết hạn…")
// để màn đăng nhập giải thích được. Bị đá về form trắng trơn giữa lúc đang làm
// thì người dùng tưởng app hỏng.
export const notifyAuthLost = (reason = '') => onAuthLost(reason)
