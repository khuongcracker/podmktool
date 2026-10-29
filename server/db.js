// SQLite qua `node:sqlite` (built-in từ Node 22.5, ở đây chạy Node 24).
// Chọn built-in thay vì better-sqlite3 để backend KHÔNG có dependency native —
// deploy lên máy khác không phải cài build tool.
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const DB_PATH = process.env.DB_PATH || './data/app.db'
mkdirSync(dirname(DB_PATH), { recursive: true })

export const db = new DatabaseSync(DB_PATH)

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE,
  pass_hash   TEXT NOT NULL,
  salt        TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Một hàng = một phiên đăng nhập. ended_at NULL nghĩa là chưa logout.
CREATE TABLE IF NOT EXISTS sessions (
  id           TEXT PRIMARY KEY,              -- token ngẫu nhiên, cũng là cookie
  user_id      INTEGER NOT NULL REFERENCES users(id),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at     TEXT,
  end_reason   TEXT,                          -- 'logout' | 'expired'
  ip           TEXT,
  user_agent   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, created_at);

-- Một hàng = một lượt gọi API upstream.
-- CỐ Ý chỉ lưu SỐ LIỆU THÔ (token, số ảnh), KHÔNG lưu thành tiền:
-- giá thay đổi theo thời gian, tính tiền lúc đọc thì đổi bảng giá là số cũ
-- tự tính lại đúng. Lưu tiền cứng vào đây là khoá chết vào giá của hôm nay.
CREATE TABLE IF NOT EXISTS usage_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  session_id     TEXT REFERENCES sessions(id),
  provider       TEXT NOT NULL,               -- 'gemini' | 'openai'
  model          TEXT NOT NULL,
  kind           TEXT NOT NULL,               -- 'text' | 'image'
  ok             INTEGER NOT NULL,
  prompt_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens  INTEGER NOT NULL DEFAULT 0,
  images         INTEGER NOT NULL DEFAULT 0,
  ms             INTEGER NOT NULL DEFAULT 0,
  error          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_events(user_id, created_at);
`)

/* ---------------- users ---------------- */

export const findUser = (username) =>
  db.prepare('SELECT * FROM users WHERE username = ?').get(username)

export const findUserById = (id) =>
  db.prepare('SELECT * FROM users WHERE id = ?').get(id)

export const createUser = (username, pass_hash, salt, role = 'user') =>
  db.prepare(
    'INSERT INTO users (username, pass_hash, salt, role) VALUES (?, ?, ?, ?)'
  ).run(username, pass_hash, salt, role)

export const setUserActive = (username, active) =>
  db.prepare('UPDATE users SET active = ? WHERE username = ?').run(active ? 1 : 0, username)

export const setUserPassword = (username, pass_hash, salt) =>
  db.prepare('UPDATE users SET pass_hash = ?, salt = ? WHERE username = ?').run(pass_hash, salt, username)

export const setUserRole = (username, role) =>
  db.prepare('UPDATE users SET role = ? WHERE username = ?').run(role, username)

// Số admin còn đăng nhập được. Dùng để chặn thao tác hàng loạt tự khoá hết
// đường vào (xoá / khoá / hạ quyền admin cuối cùng là mất luôn trang quản trị).
export const countActiveAdmins = () =>
  db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").get().n

// Xoá hẳn: user + phiên + usage_events của user đó.
// CỐ Ý xoá luôn số liệu (bro chốt 2026-08-21): foreign_keys đang BẬT nên không
// dọn con thì xoá cha sẽ fail; mà giữ số liệu mồ côi thì báo cáo hiện user rỗng,
// khó hiểu hơn là mất hẳn. UI có nhiệm vụ cảnh báo số phiên/lượt sắp mất.
export function deleteUser(username) {
  const u = findUser(username)
  if (!u) return 0
  db.exec('BEGIN')
  try {
    db.prepare('DELETE FROM usage_events WHERE user_id = ?').run(u.id)
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id)
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return 1
}

export const listUsers = () =>
  db.prepare(
    `SELECT u.id, u.username, u.role, u.active, u.created_at,
            (SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id)     AS logins,
            (SELECT COUNT(*) FROM usage_events e WHERE e.user_id = u.id) AS calls
     FROM users u ORDER BY u.id`
  ).all()

/* ---------------- sessions ---------------- */

export const createSession = (id, user_id, ip, ua) =>
  db.prepare(
    'INSERT INTO sessions (id, user_id, ip, user_agent) VALUES (?, ?, ?, ?)'
  ).run(id, user_id, ip || '', ua || '')

export const getSession = (id) =>
  db.prepare('SELECT * FROM sessions WHERE id = ? AND ended_at IS NULL').get(id)

export const touchSession = (id) =>
  db.prepare("UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?").run(id)

export const endSession = (id, reason = 'logout') =>
  db.prepare(
    "UPDATE sessions SET ended_at = datetime('now'), end_reason = ? WHERE id = ? AND ended_at IS NULL"
  ).run(reason, id)

// Phiên quá hạn không hoạt động -> đóng, ghi rõ là hết hạn chứ không phải logout.
export const expireStaleSessions = (minutes) =>
  db.prepare(
    `UPDATE sessions SET ended_at = last_seen_at, end_reason = 'expired'
     WHERE ended_at IS NULL AND last_seen_at < datetime('now', ?)`
  ).run(`-${minutes} minutes`)

/* ---------------- usage ---------------- */

export const logUsage = (e) =>
  db.prepare(
    `INSERT INTO usage_events
       (user_id, session_id, provider, model, kind, ok, prompt_tokens, output_tokens, images, ms, error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    e.user_id, e.session_id || null, e.provider, e.model, e.kind,
    e.ok ? 1 : 0, e.prompt_tokens | 0, e.output_tokens | 0, e.images | 0, e.ms | 0,
    e.error || null
  )

// Thời lượng đăng nhập từng người. Phiên chưa đóng tính tới last_seen_at
// (không tính tới "bây giờ" — tab mở quên đóng sẽ thổi phồng số liệu).
export const sessionReport = (from, to) =>
  db.prepare(
    `SELECT u.username,
            COUNT(s.id)                                                   AS logins,
            SUM(strftime('%s', COALESCE(s.ended_at, s.last_seen_at))
              - strftime('%s', s.created_at))                             AS seconds,
            MAX(COALESCE(s.ended_at, s.last_seen_at))                     AS last_active
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.created_at BETWEEN ? AND ?
     GROUP BY u.id ORDER BY seconds DESC`
  ).all(from, to)

export const usageReport = (from, to) =>
  db.prepare(
    `SELECT u.username, e.provider, e.model, e.kind,
            COUNT(*)                       AS calls,
            SUM(e.ok)                      AS ok_calls,
            SUM(e.prompt_tokens)           AS prompt_tokens,
            SUM(e.output_tokens)           AS output_tokens,
            SUM(e.images)                  AS images
     FROM usage_events e JOIN users u ON u.id = e.user_id
     WHERE e.created_at BETWEEN ? AND ?
     GROUP BY u.id, e.provider, e.model, e.kind
     ORDER BY u.username, calls DESC`
  ).all(from, to)

export const myHistory = (user_id, limit = 200) =>
  db.prepare(
    `SELECT provider, model, kind, ok, prompt_tokens, output_tokens, images, ms, error, created_at
     FROM usage_events WHERE user_id = ? ORDER BY id DESC LIMIT ?`
  ).all(user_id, limit)
