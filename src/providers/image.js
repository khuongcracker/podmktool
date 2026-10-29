// Lớp sinh ảnh trung lập provider.
//
// Nhận body kiểu Gemini (contents/parts + generationConfig.imageConfig) và:
//   - Gemini  -> gửi nguyên xi
//   - OpenAI  -> rút prompt + ảnh tham chiếu ra, gọi /api/openai-image
//
// ⚠ Ghi chú kỹ thuật, đọc trước khi trách chất lượng ảnh:
// Pipeline này ép độ lớn sản phẩm bằng DUAL-REFERENCE — ảnh 1 là design, ảnh 2
// là size-guide canvas dựng sẵn (`shared.js#composeScaleCanvas`). Nano Banana
// coi ảnh thứ hai như "thẩm quyền về tỉ lệ" và bám theo. gpt-image-1 đi qua
// /images/edits, xử lý nhiều ảnh đầu vào theo cách khác — nó KHÔNG bảo toàn tỉ
// lệ theo ảnh neo giống vậy. Chọn GPT thì ảnh vẫn ra, nhưng phần kiểm soát
// scale yếu hơn rõ rệt. Đây là giới hạn của mô hình, không phải bug.

import { getModel, getModelMeta } from './models.js'
import { callProvider, apiOpenaiImage, AuthError, notifyAuthLost } from '../api.js'

export async function callImageBody(geminiBody) {
  const meta = getModelMeta('image')
  const model = getModel('image')
  console.log('[ai] → (image)', model)

  try {
    let out
    if (meta.provider === 'openai') {
      const { prompt, images } = fromGeminiBody(geminiBody)
      out = await apiOpenaiImage({
        model,
        prompt,
        aspectRatio: geminiBody?.generationConfig?.imageConfig?.aspectRatio || 'auto',
        images,
      })
    } else {
      const data = await callProvider('gemini', model, geminiBody)
      out = extractInlineImage(data)
    }
    if (!out?.base64) throw new Error('Model không trả về ảnh.')
    console.log('[ai] ← (image)', model, 'ok')
    return out
  } catch (e) {
    console.error('[ai] ✗ (image)', model, e.message)
    if (e instanceof AuthError) notifyAuthLost(e.message)
    throw e
  }
}

// Gộp mọi phần text thành một prompt, gom mọi inlineData thành mảng ảnh.
function fromGeminiBody(body) {
  const parts = (body.contents || []).flatMap((c) => c.parts || [])
  return {
    prompt: parts.map((p) => p.text).filter(Boolean).join('\n\n'),
    images: parts
      .filter((p) => p.inlineData?.data)
      .map((p) => ({ mimeType: p.inlineData.mimeType || 'image/png', base64: p.inlineData.data })),
  }
}

function extractInlineImage(data) {
  for (const p of data?.candidates?.[0]?.content?.parts || []) {
    if (p.inlineData?.data) {
      return { mimeType: p.inlineData.mimeType || 'image/png', base64: p.inlineData.data }
    }
  }
  return null
}
