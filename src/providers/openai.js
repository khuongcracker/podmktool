// OpenAI (GPT) provider — dùng cho bước TÁCH ELEMENT của nhánh Redesign,
// thay thế cho Gemini. Sinh ảnh vẫn ở Gemini vì khả năng edit-giữ-reference
// là điểm mạnh riêng của nó.
//
// Không còn giữ API key ở frontend — gọi qua backend, server gắn key.

import { parseJsonArrayOfObjectsLoose, normalizeElements } from './gemini.js'
import { getModel, getModelMeta } from './models.js'
import { callProvider, AuthError, notifyAuthLost } from '../api.js'

// User chọn model ở UI. Nếu model text đang chọn không phải của OpenAI thì
// bước này vẫn cần một model OpenAI — lấy mặc định gpt-4o.
const openaiTextModel = () =>
  getModelMeta('text').provider === 'openai' ? getModel('text') : 'gpt-4o'

// Phân tích ảnh design phẳng và liệt kê các element.
// Cùng contract với extractElementsGemini: [{name, description, box_2d|null}].
export async function extractElementsGpt(designImage) {
  const model = openaiTextModel()
  const body = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${designImage.mimeType};base64,${designImage.base64}` },
          },
          {
            type: 'text',
            text:
              `This is a flat 2D print design. Identify its distinct visual ELEMENTS — ` +
              `each separable component a designer would treat as one unit: ` +
              `main illustration/subject, individual text blocks, decorative frames/borders, ` +
              `background pattern/texture, icons, badges. Between 2 and 8 elements. ` +
              `Return ONLY a JSON array (no markdown), one object per element, with keys: ` +
              `"name" (short label, max 5 words), ` +
              `"description" (one sentence: what it is, its style and colors), ` +
              `"box_2d" ([ymin, xmin, ymax, xmax], integers normalized to 0-1000 relative to the image; ` +
              `use your best estimate).`,
          },
        ],
      },
    ],
  }

  console.log('[ai] →', model)
  let data
  try {
    data = await callProvider('openai', model, body)
  } catch (e) {
    console.error('[ai] ✗', model, e.message)
    if (e instanceof AuthError) notifyAuthLost(e.message)
    throw e
  }
  const text = data?.choices?.[0]?.message?.content || ''
  return normalizeElements(parseJsonArrayOfObjectsLoose(text))
}
