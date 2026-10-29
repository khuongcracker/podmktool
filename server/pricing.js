// ⚠️ BẢNG GIÁ — PHẢI ĐIỀN TRƯỚC KHI XEM BÁO CÁO CHI PHÍ.
//
// CỐ Ý để trống thay vì điền số. Giá API thay đổi theo thời gian và theo
// hợp đồng từng tài khoản; điền số bịa vào đây thì báo cáo chi phí trông có vẻ
// đúng nhưng sai — tệ hơn nhiều so với việc hiện thẳng "chưa cấu hình giá".
//
// Lấy số ở đâu:
//   Gemini  → https://ai.google.dev/pricing
//   OpenAI  → https://openai.com/api/pricing
//
// Đơn vị:
//   text_in  / text_out : USD cho MỘT TRIỆU token
//   per_image           : USD cho MỘT ảnh sinh ra
//
// Không cần restart server sau khi sửa file này ở chế độ dev (Node --watch).
// Chi phí được tính LÚC ĐỌC báo cáo từ số liệu thô, nên sửa giá là toàn bộ
// lịch sử cũ tự tính lại theo giá mới.

export const PRICING = {
  'gemini-3.1-pro-preview': { text_in: null, text_out: null },
  'gemini-3.5-flash':       { text_in: null, text_out: null },
  'gemini-3-pro-image':     { text_in: null, text_out: null, per_image: null },
  'gemini-3.1-flash-image': { text_in: null, text_out: null, per_image: null },
  'gpt-4o':                 { text_in: null, text_out: null },
  'gpt-4o-mini':            { text_in: null, text_out: null },
  'gpt-image-1':            { text_in: null, text_out: null, per_image: null },
}

// Trả về { cost, priced } — priced=false nghĩa là model chưa có giá,
// UI phải hiện "chưa cấu hình giá" chứ KHÔNG được hiển thị 0 USD.
export function costOf({ model, prompt_tokens = 0, output_tokens = 0, images = 0 }) {
  const p = PRICING[model]
  if (!p) return { cost: 0, priced: false }

  let cost = 0
  let priced = true

  if (prompt_tokens) {
    if (p.text_in == null) priced = false
    else cost += (prompt_tokens / 1_000_000) * p.text_in
  }
  if (output_tokens) {
    if (p.text_out == null) priced = false
    else cost += (output_tokens / 1_000_000) * p.text_out
  }
  if (images) {
    if (p.per_image == null) priced = false
    else cost += images * p.per_image
  }
  return { cost, priced }
}

export const isPricingConfigured = () =>
  Object.values(PRICING).some((p) => Object.values(p).some((v) => v != null))
