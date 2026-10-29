// Lớp gọi model PHÂN TÍCH, trung lập provider.
//
// Trước đây mọi hàm phân tích viết thẳng theo định dạng `contents/parts` của
// Gemini nên GPT chỉ dùng được ở đúng một bước. Thay vì viết lại từng hàm,
// lớp này nhận NGUYÊN body kiểu Gemini rồi dịch sang định dạng OpenAI khi cần
// — các hàm gọi nó không phải đổi gì ngoài đúng dòng gọi.
//
// Chỉ dùng cho bước phân tích (text + vision). Sinh ảnh vẫn ở Gemini vì
// khả năng edit-giữ-reference là điểm mạnh riêng của Nano Banana.

import { getModel, getModelMeta } from './models.js'
import { callProvider, AuthError, notifyAuthLost } from '../api.js'

export async function callTextBody(geminiBody) {
  const meta = getModelMeta('text')
  const model = getModel('text')
  console.log('[ai] →', model)

  try {
    const data =
      meta.provider === 'openai'
        ? await callProvider('openai', model, toOpenAI(geminiBody))
        : await callProvider('gemini', model, geminiBody)

    const out = meta.provider === 'openai' ? openaiText(data) : geminiText(data)
    console.log('[ai] ←', model, `${out.length} ký tự`)
    return out
  } catch (e) {
    console.error('[ai] ✗', model, e.message)
    if (e instanceof AuthError) notifyAuthLost(e.message)
    throw e
  }
}

/* ---------------- Gemini body -> OpenAI body ---------------- */

function toOpenAI(body) {
  const messages = (body.contents || []).map((c) => ({
    role: c.role === 'model' ? 'assistant' : 'user',
    content: (c.parts || [])
      .map((p) => {
        if (p.text) return { type: 'text', text: p.text }
        if (p.inlineData?.data) {
          return {
            type: 'image_url',
            image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
          }
        }
        return null
      })
      .filter(Boolean),
  }))
  // `tools: [{url_context}]` của Gemini cố ý KHÔNG dịch — không có tương đương
  // ở OpenAI. Các bước đọc URL giờ lấy nội dung trang từ backend trước khi gọi
  // model, nên không hàm nào còn dùng tool đó nữa.
  return { messages }
}

const geminiText = (data) =>
  (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim()

const openaiText = (data) => (data?.choices?.[0]?.message?.content || '').trim()
