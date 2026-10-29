// Model registry + lựa chọn model của user.
//
// Vì sao là module state chứ không phải React state truyền xuống: các hàm
// provider (gemini.js / openai.js) là hàm thuần, không phải hook — thread một
// object model qua ~14 call site sẽ làm bẩn hết signature. App là app 1 người
// dùng chạy trong browser nên một điểm lựa chọn toàn cục là đủ và đúng mức.
//
// Thêm model mới: thêm vào registry bên dưới, không phải sửa call site nào.

const LS_KEY = 'model_choice'

// --- registry ---------------------------------------------------------------
// `kind` quyết định model xuất hiện ở dropdown nào.
//   text  = phân tích / viết prompt / chấm (vision + text)
//   image = sinh và sửa ảnh
export const MODELS = {
  text: [
    {
      id: 'gemini-3.1-pro-preview',
      label: 'Gemini 3.1 Pro',
      provider: 'gemini',
      note: 'Mặc định. Chất lượng cao nhất, hiểu prompt tốt, chậm và đắt hơn.',
    },
    {
      id: 'gemini-3.5-flash',
      label: 'Gemini 3.5 Flash',
      provider: 'gemini',
      note: 'Nhanh và rẻ hơn nhiều. Dùng khi chạy số lượng lớn.',
    },
    {
      id: 'gpt-4o',
      label: 'GPT-4o',
      provider: 'openai',
      note: 'Cần OpenAI key. Chạy được MỌI bước phân tích, ngang hàng Gemini.',
    },
    {
      id: 'gpt-4o-mini',
      label: 'GPT-4o mini',
      provider: 'openai',
      note: 'Cần OpenAI key. Nhanh và rẻ hơn GPT-4o, chất lượng phân tích thấp hơn.',
    },
  ],
  // Sinh ảnh có cả hai provider theo yêu cầu. Lưu ý thật: pipeline ép tỉ lệ sản
  // phẩm bằng dual-reference size-guide — Nano Banana bám theo ảnh neo, còn
  // gpt-image-1 (qua /images/edits) thì không. Xem providers/image.js.
  image: [
    {
      id: 'gemini-3.1-flash-image',
      label: 'Nano Banana 2 (Gemini 3.1 Flash Image)',
      provider: 'gemini',
      note: 'Mặc định. Nhanh hơn hẳn, rẻ hơn, chất lượng mockup không thua Pro.',
    },
    {
      id: 'gemini-3-pro-image',
      label: 'Nano Banana Pro (Gemini 3 Pro Image)',
      provider: 'gemini',
      note: 'Chậm và đắt hơn. Đổi lên khi ảnh cần nhiều chữ hoặc chi tiết rất nhỏ.',
    },
    {
      id: 'gpt-image-1',
      label: 'GPT Image 1 (OpenAI)',
      provider: 'openai',
      note: 'Cần OpenAI key. ⚠ Kiểm soát tỉ lệ sản phẩm YẾU HƠN — không bám ảnh neo size-guide như Nano Banana.',
    },
  ],
}

export const DEFAULTS = {
  text: 'gemini-3.1-pro-preview',
  // Đổi Pro -> Flash ngày 2026-08-21 (bro chốt): Pro thừa cho phần lớn mockup,
  // Flash nhanh hơn và rẻ hơn mà chất lượng không thua. Ai đã TỰ CHỌN model thì
  // localStorage của họ vẫn thắng — đổi mặc định chỉ chạm người chưa đụng dropdown.
  image: 'gemini-3.1-flash-image',
}

// --- lựa chọn hiện tại ------------------------------------------------------
let choice = { ...DEFAULTS }

try {
  const saved = JSON.parse(localStorage.getItem(LS_KEY) || 'null')
  if (saved) {
    // Chỉ nhận id còn tồn tại trong registry — model bị gỡ khỏi registry thì
    // rơi về mặc định thay vì gọi API bằng một id đã chết.
    for (const kind of ['text', 'image']) {
      if (MODELS[kind].some((m) => m.id === saved[kind])) choice[kind] = saved[kind]
    }
  }
} catch (_) {
  /* localStorage hỏng hoặc bị chặn — dùng mặc định */
}

// Model mà tài khoản THƯỜNG được thấy/dùng. Phải khớp USER_MODELS ở
// server/proxy.js — đây chỉ là bản sao cho giao diện, CỔNG CHẶN THẬT nằm ở server.
export const USER_MODELS = ['gemini-3.1-pro-preview', 'gemini-3.1-flash-image']

let unlocked = false
/** Admin thì mở hết; user thường bị khoá về đúng cặp mặc định.
 *  Gọi ngay khi biết vai trò (lúc mở app và lúc đăng nhập xong). */
export function applyRole(role) {
  unlocked = role === 'admin'
  if (unlocked) return
  // Ai lỡ chọn model khác từ trước thì kéo về mặc định, KHÔNG để lựa chọn cũ
  // trong localStorage làm họ gọi model bị chặn rồi ăn 403 không hiểu vì sao.
  let changed = false
  for (const kind of ['text', 'image']) {
    if (!USER_MODELS.includes(choice[kind])) { choice = { ...choice, [kind]: DEFAULTS[kind] }; changed = true }
  }
  if (changed) { try { localStorage.removeItem(LS_KEY) } catch (_) {} }
}

/** Danh sách model hiện ra ở dropdown, đã lọc theo vai trò. */
export function visibleModels(kind) {
  return unlocked ? MODELS[kind] : MODELS[kind].filter((m) => USER_MODELS.includes(m.id))
}

export const canPickModel = () => unlocked

export function getModel(kind) {
  return choice[kind] || DEFAULTS[kind]
}

export function getModelMeta(kind) {
  const id = getModel(kind)
  return MODELS[kind].find((m) => m.id === id) || MODELS[kind][0]
}

export function setModel(kind, id) {
  if (!MODELS[kind]?.some((m) => m.id === id)) return
  if (!unlocked && !USER_MODELS.includes(id)) return
  choice = { ...choice, [kind]: id }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(choice))
  } catch (_) {}
}

export function getChoice() {
  return { ...choice }
}

// Model text hiện tại có chạy trên OpenAI không — dùng để quyết định
// key nào cần và bước nào chuyển provider.
export function textProvider() {
  return getModelMeta('text').provider
}
