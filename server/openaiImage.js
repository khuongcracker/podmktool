// Sinh / sửa ảnh bằng OpenAI (gpt-image-1).
//
// Vì sao phải có file riêng thay vì dùng chung proxy: OpenAI dùng endpoint và
// định dạng KHÁC hẳn Gemini —
//   - không có ảnh tham chiếu -> POST /v1/images/generations  (JSON)
//   - có ảnh tham chiếu        -> POST /v1/images/edits       (multipart)
// còn Gemini thì cả hai đều là generateContent với inlineData.
import { logUsage } from './db.js'

const GEN_URL = 'https://api.openai.com/v1/images/generations'
const EDIT_URL = 'https://api.openai.com/v1/images/edits'
const TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 120_000)

export const ALLOWED_IMAGE_MODELS = new Set(['gpt-image-1'])

// gpt-image-1 chỉ nhận 3 kích thước cố định, không nhận tỉ lệ tuỳ ý như Gemini.
// Quy tỉ lệ về kích thước gần nhất.
export function sizeForAspect(aspect) {
  if (!aspect || aspect === 'auto') return 'auto'
  const [w, h] = String(aspect).split(':').map(Number)
  if (!w || !h) return 'auto'
  const r = w / h
  if (r > 1.15) return '1536x1024'
  if (r < 0.87) return '1024x1536'
  return '1024x1024'
}

const b64ToBlob = (base64, mimeType) =>
  new Blob([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], { type: mimeType })

export async function openaiImageHandler(req, res) {
  const { model, prompt, aspectRatio, images = [] } = req.body || {}
  if (!model || !prompt) return res.status(400).json({ error: 'Thiếu model hoặc prompt.' })
  if (!ALLOWED_IMAGE_MODELS.has(model)) {
    return res.status(400).json({ error: `Model ảnh không được phép: ${model}` })
  }
  // gpt-image-1 không nằm trong cặp mặc định nên chỉ admin gọi được.
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      error: `Tài khoản của bạn chưa được mở model "${model}". Liên hệ admin nếu cần.`,
    })
  }
  const key = process.env.OPENAI_API_KEY
  if (!key) return res.status(503).json({ error: 'Server chưa cấu hình OPENAI_API_KEY.' })

  const size = sizeForAspect(aspectRatio)
  const started = Date.now()
  const record = (ok, usage, error) =>
    logUsage({
      user_id: req.user.id,
      session_id: req.sid,
      provider: 'openai',
      model,
      kind: 'image',
      ok,
      ...usage,
      ms: Date.now() - started,
      error,
    })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let upstream
  try {
    if (images.length) {
      // Có ảnh tham chiếu -> /images/edits, gửi dạng multipart.
      const form = new FormData()
      form.append('model', model)
      form.append('prompt', prompt)
      if (size !== 'auto') form.append('size', size)
      images.forEach((img, i) => {
        form.append('image[]', b64ToBlob(img.base64, img.mimeType || 'image/png'), `ref-${i}.png`)
      })
      upstream = await fetch(EDIT_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: controller.signal,
      })
    } else {
      upstream = await fetch(GEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, prompt, size, n: 1 }),
        signal: controller.signal,
      })
    }
  } catch (e) {
    clearTimeout(timer)
    const msg =
      e.name === 'AbortError'
        ? `OpenAI images quá ${TIMEOUT_MS / 1000}s không phản hồi.`
        : `Không gọi được OpenAI images: ${e.message}`
    record(false, { prompt_tokens: 0, output_tokens: 0, images: 0 }, msg)
    return res.status(504).json({ error: msg })
  }
  clearTimeout(timer)

  let data
  try {
    data = await upstream.json()
  } catch (_) {
    record(false, { prompt_tokens: 0, output_tokens: 0, images: 0 }, 'Upstream trả về không phải JSON')
    return res.status(502).json({ error: 'OpenAI images trả về không phải JSON.' })
  }

  if (!upstream.ok) {
    const msg = data?.error?.message || `HTTP ${upstream.status}`
    record(false, { prompt_tokens: 0, output_tokens: 0, images: 0 }, msg)
    return res.status(upstream.status).json({ error: msg })
  }

  const b64 = data?.data?.[0]?.b64_json
  if (!b64) {
    record(false, { prompt_tokens: 0, output_tokens: 0, images: 0 }, 'Không có ảnh trong phản hồi')
    return res.status(502).json({ error: 'OpenAI không trả về ảnh.' })
  }

  const u = data?.usage || {}
  record(
    true,
    {
      prompt_tokens: u.input_tokens || 0,
      output_tokens: u.output_tokens || 0,
      images: data.data.length,
    },
    null
  )

  // Chuẩn hoá về đúng hình dạng frontend đang dùng cho Gemini.
  res.json({ mimeType: 'image/png', base64: b64 })
}
