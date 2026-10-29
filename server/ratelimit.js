// Chặn brute-force đăng nhập.
//
// Cửa sổ trượt trong bộ nhớ — đủ cho tool nội bộ chạy MỘT tiến trình. Nếu sau
// này chạy nhiều instance sau load balancer thì phải chuyển sang store dùng
// chung (Redis hoặc chính bảng SQLite), vì mỗi tiến trình đang đếm riêng.
//
// Đếm theo CẶP (ip, username) và theo IP:
//   - theo cặp: chặn dò mật khẩu của MỘT tài khoản cụ thể — đây mới là lớp bảo
//     vệ thật, và nó vẫn chặt.
//   - theo IP : chặn quét nhiều username từ một nguồn.
//
// ⚠️ Vì sao trần IP nới rộng và bộ đếm IP nhớ cả username (2026-08-21):
// Cả văn phòng ra internet qua MỘT IP NAT. Trần 20 lần sai / 15 phút cho cả IP
// nghĩa là 10 người mới nhận tài khoản, mỗi người gõ sai 2 lần là khoá đăng
// nhập của TOÀN BỘ văn phòng — người gõ đúng cũng không vào được. Sự cố này
// không liên quan gì tới kẻ tấn công, nó chỉ đánh vào chính đồng nghiệp.
//
// Nới trần IP KHÔNG làm yếu lớp bảo vệ thật: dò mật khẩu một tài khoản vẫn bị
// bộ đếm theo cặp chặn ở 10 lần / 10 phút (≈1.400 lần/ngày — không ăn thua với
// mật khẩu tử tế). Bộ đếm IP chỉ còn nhiệm vụ chặn quét diện rộng.
const WINDOW_MS = Number(process.env.LOGIN_WINDOW_MS || 10 * 60_000)
const MAX_PER_USER = Number(process.env.LOGIN_MAX_PER_USER || 10)
const MAX_PER_IP = Number(process.env.LOGIN_MAX_PER_IP || 100)

// key -> [{ t, username }]. Giữ cả username (chứ không chỉ mốc thời gian) để
// khi một người đăng nhập được thì gỡ đúng phần họ đóng góp ra khỏi bộ đếm IP.
const hits = new Map()

function recent(key, now) {
  const arr = (hits.get(key) || []).filter((h) => now - h.t < WINDOW_MS)
  if (arr.length) hits.set(key, arr)
  else hits.delete(key)
  return arr
}

// Dọn định kỳ để Map không phình vô hạn khi bị quét.
// unref() để timer này không giữ tiến trình sống.
setInterval(() => {
  const now = Date.now()
  for (const key of [...hits.keys()]) recent(key, now)
}, WINDOW_MS).unref?.()

const pairKey = (ip, username) => `u:${ip}|${username}`
const ipKey = (ip) => `i:${ip}`

export function loginBlocked(ip, username) {
  const now = Date.now()
  const byUser = recent(pairKey(ip, username), now)
  const byIp = recent(ipKey(ip), now)
  if (byUser.length >= MAX_PER_USER || byIp.length >= MAX_PER_IP) {
    const oldest = Math.min(...[...byUser, ...byIp].map((h) => h.t))
    return Math.ceil((WINDOW_MS - (now - oldest)) / 1000) // số giây phải chờ
  }
  return 0
}

export function loginFailed(ip, username) {
  const now = Date.now()
  const rec = { t: now, username }
  for (const key of [pairKey(ip, username), ipKey(ip)]) {
    hits.set(key, [...(hits.get(key) || []), rec])
  }
}

// Đăng nhập thành công thì xoá bộ đếm của người đó — cả bộ đếm cặp lẫn phần họ
// đóng góp vào bộ đếm IP. Người thật gõ nhầm vài lần rồi vào được thì không nên
// bị phạt tiếp, và càng không nên để lần nhầm của họ tính vào trần chung của
// văn phòng. Các lần sai với username KHÁC vẫn nằm nguyên trong bộ đếm IP, nên
// việc quét nhiều username vẫn bị chặn.
export function loginOk(ip, username) {
  hits.delete(pairKey(ip, username))
  const key = ipKey(ip)
  const rest = (hits.get(key) || []).filter((h) => h.username !== username)
  if (rest.length) hits.set(key, rest)
  else hits.delete(key)
}
