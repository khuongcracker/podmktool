// Auth: scrypt (node:crypto) + session cookie httpOnly.
// Không dùng bcrypt/argon2 vì cả hai là native dependency — scrypt có sẵn trong
// Node và đủ mạnh cho tool nội bộ.
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import {
  findUser, findUserById, getSession, touchSession, endSession, expireStaleSessions,
} from './db.js'

const COOKIE = 'pod_sid'
export const SESSION_IDLE_MIN = Number(process.env.SESSION_IDLE_MIN || 480) // 8h

export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') }
}

export function verifyPassword(password, salt, expected) {
  const got = scryptSync(password, salt, 64)
  const want = Buffer.from(expected, 'hex')
  // So sánh theo thời gian hằng định để không rò rỉ thông tin qua thời gian phản hồi.
  return got.length === want.length && timingSafeEqual(got, want)
}

export const newSessionId = () => randomBytes(32).toString('hex')

// Pass ngẫu nhiên để cấp hàng loạt. Bỏ 0/O/1/l/I vì admin hay đọc pass qua
// điện thoại hoặc chép tay — nhầm một ký tự là một lượt hỏi lại.
const PASS_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
export function generatePassword(len = 10) {
  const b = randomBytes(len)
  let out = ''
  for (let i = 0; i < len; i++) out += PASS_ALPHABET[b[i] % PASS_ALPHABET.length]
  return out
}

export function setSessionCookie(res, sid) {
  res.cookie(COOKIE, sid, {
    httpOnly: true,                 // JS phía trang không đọc được -> chống XSS lấy phiên
    sameSite: 'lax',
    secure: process.env.SECURE_COOKIE === '1',  // bật khi deploy sau HTTPS
    maxAge: SESSION_IDLE_MIN * 60 * 1000,
    path: '/',
  })
}

export const clearSessionCookie = (res) => res.clearCookie(COOKIE, { path: '/' })
export const readSid = (req) => req.cookies?.[COOKIE] || ''

// Middleware: gắn req.user / req.sid, hoặc 401.
export function requireAuth(req, res, next) {
  expireStaleSessions(SESSION_IDLE_MIN)
  const sid = readSid(req)
  if (!sid) return res.status(401).json({ error: 'Chưa đăng nhập.' })
  const s = getSession(sid)
  if (!s) {
    clearSessionCookie(res)
    return res.status(401).json({ error: 'Phiên đã hết hạn hoặc đã đăng xuất.' })
  }
  const u = findUserById(s.user_id)
  if (!u || !u.active) {
    endSession(sid, 'expired')
    clearSessionCookie(res)
    // authLost: phiên này chết hẳn, KHÁC với 403 "cần quyền admin" (phiên vẫn
    // sống, chỉ là không đủ quyền cho route đó). Client dựa vào cờ này để đá về
    // màn đăng nhập — admin khoá/xoá một người giữa chừng thì họ thấy form đăng
    // nhập, chứ không đứng nhìn một dòng lỗi đỏ không biết làm gì.
    return res.status(403).json({ error: 'Tài khoản đã bị khoá.', authLost: true })
  }
  touchSession(sid)
  req.user = u
  req.sid = sid
  next()
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Cần quyền admin.' })
  next()
}

export function login(username, password) {
  const u = findUser(username)
  // Vẫn chạy hash khi không có user để thời gian phản hồi không tiết lộ
  // username nào tồn tại.
  const ok = u
    ? verifyPassword(password, u.salt, u.pass_hash)
    : (hashPassword(password), false)
  if (!ok) return { error: 'Sai tài khoản hoặc mật khẩu.' }
  if (!u.active) return { error: 'Tài khoản đã bị khoá.' }
  return { user: u }
}
