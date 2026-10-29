// Lịch sử phiên — lưu ở IndexedDB, không phải localStorage.
//
// Vì sao IndexedDB: một phiên mang theo 4–10 ảnh base64, mỗi ảnh cỡ MB.
// localStorage trần ~5MB cho CẢ origin và chỉ nhận chuỗi, nên một phiên là
// đã tràn. IndexedDB không có trần cứng đó và lưu được object thẳng.
//
// Hai store, cố ý tách:
//   meta — {id, at, name, url, count, thumb} · nhẹ, cột trái đọc mỗi lần mở app
//   blob — bản đầy đủ kèm ảnh · chỉ đọc khi người dùng bấm mở lại một phiên
// Gộp một store thì mỗi lần vẽ cột trái phải nạp toàn bộ ảnh của mọi phiên.

const DB_NAME = 'podmktool'
const DB_VERSION = 1
const META = 'meta'
const BLOB = 'blob'
const KEEP = 30 // giữ 30 phiên gần nhất, cũ hơn thì dọn

let dbPromise = null

function openDb() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, DB_VERSION)
    rq.onupgradeneeded = () => {
      const db = rq.result
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'id' })
      if (!db.objectStoreNames.contains(BLOB)) db.createObjectStore(BLOB, { keyPath: 'id' })
    }
    rq.onsuccess = () => resolve(rq.result)
    rq.onerror = () => reject(rq.error)
  })
  return dbPromise
}

function tx(db, stores, mode) {
  const t = db.transaction(stores, mode)
  return {
    t,
    store: (n) => t.objectStore(n),
    done: new Promise((res, rej) => {
      t.oncomplete = () => res()
      t.onerror = () => rej(t.error)
      t.onabort = () => rej(t.error)
    }),
  }
}

const asPromise = (rq) => new Promise((res, rej) => {
  rq.onsuccess = () => res(rq.result)
  rq.onerror = () => rej(rq.error)
})

// Danh sách cho cột trái — mới nhất lên đầu. Lỗi thì trả mảng rỗng: không có
// lịch sử là bất tiện, còn ném lỗi ra là chặn cả app.
export async function listSessions() {
  try {
    const db = await openDb()
    const { store } = tx(db, [META], 'readonly')
    const rows = await asPromise(store(META).getAll())
    return rows.sort((a, b) => b.at - a.at)
  } catch (e) {
    console.warn('[sessions] không đọc được lịch sử:', e?.message)
    return []
  }
}

export async function getSession(id) {
  try {
    const db = await openDb()
    const { store } = tx(db, [BLOB], 'readonly')
    return await asPromise(store(BLOB).get(id))
  } catch (e) {
    console.warn('[sessions] không mở được phiên:', e?.message)
    return null
  }
}

// `full` là toàn bộ trạng thái cần để dựng lại phiên. Trả về bản meta đã lưu.
export async function saveSession(full) {
  const meta = {
    id: full.id,
    at: full.at,
    name: full.name,
    url: full.url || '',
    count: (full.images || []).length,
    thumb: (full.images || [])[0] || null,
  }
  try {
    const db = await openDb()
    const { store, done } = tx(db, [META, BLOB], 'readwrite')
    store(META).put(meta)
    store(BLOB).put(full)
    await done
    await prune()
  } catch (e) {
    console.warn('[sessions] không lưu được phiên:', e?.message)
  }
  return meta
}

export async function deleteSession(id) {
  try {
    const db = await openDb()
    const { store, done } = tx(db, [META, BLOB], 'readwrite')
    store(META).delete(id)
    store(BLOB).delete(id)
    await done
  } catch (e) {
    console.warn('[sessions] không xoá được phiên:', e?.message)
  }
}

// Bỏ phiên cũ nhất khi vượt KEEP. Ảnh base64 tích lại rất nhanh; không dọn thì
// một ngày làm 30 lượt là kho phình vô hạn.
async function prune() {
  try {
    const db = await openDb()
    const { store } = tx(db, [META], 'readonly')
    const rows = await asPromise(store(META).getAll())
    if (rows.length <= KEEP) return
    const old = rows.sort((a, b) => b.at - a.at).slice(KEEP)
    for (const r of old) await deleteSession(r.id)
  } catch (_) { /* dọn dẹp hỏng thì thôi, không ảnh hưởng việc chính */ }
}

export function newSessionId() {
  return 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}
