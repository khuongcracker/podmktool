// Proxy tới Gemini / OpenAI.
//
// Điểm mấu chốt: API key CHỈ tồn tại ở đây (process.env), không bao giờ đi ra
// browser. Frontend gửi { model, body } — server gắn key rồi forward.
// Mọi lượt gọi đều được ghi lại vào usage_events, kể cả lượt lỗi.
import { logUsage } from './db.js'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions'
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 120_000)

// Giới hạn số lượt gen ẢNH đang bay đồng thời TOÀN SERVER. Mỗi lượt ảnh buffer
// nguyên chuỗi base64 trong RAM (vài MB) + đổ qua uplink; 1 user bấm "auto" đã
// fan-out nhiều request song song, nhiều user burst cùng lúc có thể cạn RAM/băng
// thông. Vượt ngưỡng thì XẾP HÀNG (không từ chối) — chậm chút, không sập.
// Lệnh text nhẹ nên không giới hạn. Chỉnh qua env MAX_INFLIGHT_IMAGE.
const MAX_INFLIGHT_IMAGE = Number(process.env.MAX_INFLIGHT_IMAGE || 6)
let inflightImage = 0
const imageQueue = []
export const inflightStats = () => ({ inflight: inflightImage, queued: imageQueue.length, max: MAX_INFLIGHT_IMAGE })
function acquireImageSlot() {
  return new Promise((resolve) => {
    if (inflightImage < MAX_INFLIGHT_IMAGE) { inflightImage++; resolve() }
    else imageQueue.push(resolve)
  })
}
function releaseImageSlot() {
  const next = imageQueue.shift()
  if (next) next()          // trao thẳng slot cho request đang chờ (giữ nguyên count)
  else inflightImage--
}

// Chặn frontend gọi model tuỳ ý (tránh bị lợi dụng gọi model đắt tiền).
// Muốn mở model mới: thêm vào đây VÀ vào src/providers/models.js.
export const ALLOWED = {
  gemini: new Set([
    'gemini-3.1-pro-preview',
    'gemini-3.5-flash',
    'gemini-3-pro-image',
    'gemini-3.1-flash-image',
  ]),
  openai: new Set(['gpt-4o', 'gpt-4o-mini']),
}

// Model mà tài khoản THƯỜNG được dùng. Cố ý chỉ có hai — đúng cặp mặc định:
// Pro lo phân tích và chấm, Flash lo vẽ. Mọi model khác đắt hơn mà không đem
// lại gì cho mockup thường ngày.
//
// ⚠️ Chặn phải nằm Ở ĐÂY, không phải chỉ ẩn dropdown trong React: ẩn ở giao diện
// thì mở DevTools gọi thẳng /api/gemini là qua mặt được, mà mục đích của việc
// khoá này là chặn TIỀN.
export const USER_MODELS = new Set([
  'gemini-3.1-pro-preview',
  'gemini-3.1-flash-image',
])

/** Tập model một người được phép gọi.
 *
 * Hiện tại chia theo vai trò: admin dùng hết, user thường dùng cặp mặc định.
 * Sau này muốn cấp quyền từng model cho từng người thì SỬA ĐÚNG HÀM NÀY (đọc
 * thêm một cột trong bảng users chẳng hạn) — mọi đường gọi model đều hỏi qua
 * đây, nên không phải đi sửa rải rác. */
export function modelsAllowedFor(user, provider) {
  const all = ALLOWED[provider] || new Set()
  if (user?.role === 'admin') return all
  return new Set([...all].filter((m) => USER_MODELS.has(m)))
}

const isImageModel = (m) => m.includes('image')

function geminiUsage(data) {
  const u = data?.usageMetadata || {}
  const parts = data?.candidates?.[0]?.content?.parts || []
  return {
    prompt_tokens: u.promptTokenCount || 0,
    output_tokens: (u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0),
    images: parts.filter((p) => p.inlineData?.data).length,
  }
}

function openaiUsage(data) {
  const u = data?.usage || {}
  return {
    prompt_tokens: u.prompt_tokens || 0,
    output_tokens: u.completion_tokens || 0,
    images: 0,
  }
}

async function callUpstream(url, init) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Trả về handler Express cho một provider.
export function makeProxy(provider) {
  return async function handler(req, res) {
    const { model, body } = req.body || {}
    if (!model || !body) return res.status(400).json({ error: 'Thiếu model hoặc body.' })
    if (!ALLOWED[provider]?.has(model)) {
      return res.status(400).json({ error: `Model không được phép: ${model}` })
    }
    if (!modelsAllowedFor(req.user, provider).has(model)) {
      return res.status(403).json({
        error: `Tài khoản của bạn chưa được mở model "${model}". Liên hệ admin nếu cần.`,
      })
    }

    const key = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY
    if (!key) {
      return res.status(503).json({ error: `Server chưa cấu hình ${provider.toUpperCase()}_API_KEY.` })
    }

    const kind = provider === 'gemini' && isImageModel(model) ? 'image' : 'text'
    const started = Date.now()

    const record = (ok, usage, error) =>
      logUsage({
        user_id: req.user.id,
        session_id: req.sid,
        provider, model, kind, ok,
        ...usage,
        ms: Date.now() - started,
        error,
      })

    // Chỉ throttle lượt ảnh; text đi thẳng.
    if (kind === 'image') await acquireImageSlot()
    try {
      await runUpstream()
    } finally {
      if (kind === 'image') releaseImageSlot()
    }

    async function runUpstream() {
    let upstream
    try {
      upstream =
        provider === 'gemini'
          ? await callUpstream(
              `${GEMINI_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
              }
            )
          : await callUpstream(OPENAI_URL, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
              },
              body: JSON.stringify({ ...body, model }),
            })
    } catch (e) {
      const msg =
        e.name === 'AbortError'
          ? `Upstream ${provider} quá ${UPSTREAM_TIMEOUT_MS / 1000}s không phản hồi.`
          : `Không gọi được ${provider}: ${e.message}`
      record(false, { prompt_tokens: 0, output_tokens: 0, images: 0 }, msg)
      return res.status(504).json({ error: msg })
    }

    let data
    try {
      data = await upstream.json()
    } catch (_) {
      record(false, { prompt_tokens: 0, output_tokens: 0, images: 0 }, 'Upstream trả về không phải JSON')
      return res.status(502).json({ error: 'Upstream trả về không phải JSON.' })
    }

    if (!upstream.ok) {
      const msg = data?.error?.message || `HTTP ${upstream.status}`
      // Ngay cả lượt lỗi cũng ghi — lỗi vẫn có thể bị tính tiền, và biết ai
      // đang bắn request hỏng liên tục là thông tin có giá trị.
      record(false, { prompt_tokens: 0, output_tokens: 0, images: 0 }, msg)
      return res.status(upstream.status).json({ error: msg })
    }

    record(true, provider === 'gemini' ? geminiUsage(data) : openaiUsage(data), null)
    res.json(data)
    }
  }
}
