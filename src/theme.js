// Theme sáng/tối.
//
// Ba trạng thái, KHÔNG phải hai:
//   'system' (mặc định) — bám theo cài đặt máy, đổi theo thời gian thực
//   'light' / 'dark'    — user đã chọn tay, ghi đè máy
//
// Trạng thái đã chọn ghi vào localStorage; 'system' cũng được ghi để phân biệt
// với "chưa từng chọn" (cả hai đều bám máy, nhưng nút phải hiện đúng nấc).
//
// DOM: đặt data-theme="light|dark" lên <html>. CSS chỉ đọc thuộc tính này —
// không dùng prefers-color-scheme trực tiếp trong stylesheet, để nút chuyển tay
// luôn thắng. Việc đọc máy do file này lo.

const LS_KEY = 'ui_theme'
export const THEMES = ['system', 'light', 'dark']

const mql = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
const systemTheme = () => (mql?.matches ? 'dark' : 'light')

let pref = 'system'
try {
  const saved = localStorage.getItem(LS_KEY)
  if (THEMES.includes(saved)) pref = saved
} catch (_) {}

const subs = new Set()

/** Nấc user đã chọn: 'system' | 'light' | 'dark'. */
export const getThemePref = () => pref
/** Theme ĐANG hiển thị thật: 'light' | 'dark'. */
export const getTheme = () => (pref === 'system' ? systemTheme() : pref)

function paint() {
  const active = getTheme()
  const el = document.documentElement
  el.setAttribute('data-theme', active)
  // Cho form control gốc (scrollbar, select, date picker) vẽ đúng tông.
  el.style.colorScheme = active
  return active
}

export function setThemePref(next) {
  if (!THEMES.includes(next)) return
  pref = next
  try { localStorage.setItem(LS_KEY, next) } catch (_) {}
  const active = paint()
  subs.forEach((fn) => fn(active, pref))
}

/** Bám theo cài đặt máy. */
export const followSystem = () => setThemePref('system')

/** Tự chọn: lật sang tông NGƯỢC với tông đang hiện.
 *
 * Vì sao không xoay vòng 3 nấc như trước: nấc 'system' hiển thị y hệt nấc
 * 'light' hoặc 'dark' tuỳ máy. Máy để tối thì đi từ 'dark' sang 'system' trông
 * như bấm hụt — không có gì đổi — rồi phải bấm thêm lần nữa mới sang sáng. Một
 * hành động mà lúc thì thấy kết quả lúc thì không là lỗi, không phải tính năng.
 *
 * Lật theo tông ĐANG HIỆN chứ không theo nấc đã lưu, nên bấm từ nấc nào cũng
 * đúng một lần là ra tông mình muốn — kể cả đang bám máy. */
export const toggleLightDark = () => setThemePref(getTheme() === 'dark' ? 'light' : 'dark')

export function subscribeTheme(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

// Máy đổi tông giữa chừng (macOS/Windows auto theo giờ) — chỉ ăn khi đang 'system'.
mql?.addEventListener?.('change', () => {
  if (pref !== 'system') return
  const active = paint()
  subs.forEach((fn) => fn(active, pref))
})

paint()
