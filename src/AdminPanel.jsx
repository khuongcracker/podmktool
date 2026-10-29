import { IcClose, IcArrowUp, IcMinus, IcTrash, IcKey, IcLock, IcUnlock, IcDownload, IcAlert } from './Icons.jsx'
import { useEffect, useMemo, useState } from 'react'
import {
  apiAdminUsers, apiAdminSessions, apiAdminUsage,
  apiAdminCreateUser, apiAdminBulk, apiAdminBulkAction, apiAdminExportUsers,
} from './api.js'

// Trang quản trị (chỉ admin): quản lý tài khoản + xem báo cáo login/usage.
// Nội bộ nên để tiếng Việt, không qua i18n.
//
// Mọi thao tác đổi trạng thái tài khoản đi qua MỘT hàm `runAction` → một route
// `bulk-action` phía server. Nút trên từng hàng chỉ là lối tắt với mảng 1 phần
// tử, nên luật chặn (không tự hại mình, không bỏ admin cuối) không có bản thứ hai.
export default function AdminPanel({ onClose, me }) {
  const [tab, setTab] = useState('users') // users | sessions | usage
  const [users, setUsers] = useState([])
  const [sessions, setSessions] = useState([])
  const [usage, setUsage] = useState({ rows: [], totalCost: 0, unpricedRows: 0, pricingConfigured: false })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  // form tạo user
  const [nu, setNu] = useState('')
  const [np, setNp] = useState('')
  const [nr, setNr] = useState('user')
  // import list
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [bulkPass, setBulkPass] = useState('')
  const [bulkMode, setBulkMode] = useState('skip') // skip | update
  const [bulkRes, setBulkRes] = useState(null)

  // chọn hàng loạt
  const [sel, setSel] = useState(() => new Set())
  const [passOpen, setPassOpen] = useState(false)
  const [passMode, setPassMode] = useState('same')  // same | random
  const [passValue, setPassValue] = useState('')
  const [confirmDel, setConfirmDel] = useState(null) // mảng user sắp xoá
  const [actionRes, setActionRes] = useState(null)
  const [issued, setIssued] = useState(null)         // pass ngẫu nhiên vừa cấp

  async function loadUsers() {
    try { setUsers(await apiAdminUsers()) } catch (e) { setErr(e.message) }
  }
  async function loadSessions() {
    try { setSessions(await apiAdminSessions()) } catch (e) { setErr(e.message) }
  }
  async function loadUsage() {
    try { setUsage(await apiAdminUsage()) } catch (e) { setErr(e.message) }
  }

  useEffect(() => { loadUsers() }, [])
  useEffect(() => {
    if (tab === 'sessions') loadSessions()
    if (tab === 'usage') loadUsage()
  }, [tab])

  // Bỏ khỏi vùng chọn những user không còn tồn tại (vừa bị xoá) — nếu không,
  // thanh hành động vẫn đếm người đã biến mất.
  useEffect(() => {
    setSel((prev) => {
      const alive = new Set(users.map((u) => u.username))
      const next = new Set([...prev].filter((n) => alive.has(n)))
      return next.size === prev.size ? prev : next
    })
  }, [users])

  const selected = useMemo(() => users.filter((u) => sel.has(u.username)), [users, sel])
  const allChecked = users.length > 0 && sel.size === users.length

  const toggleOne = (username) =>
    setSel((prev) => {
      const next = new Set(prev)
      next.has(username) ? next.delete(username) : next.add(username)
      return next
    })
  const toggleAll = () => setSel(allChecked ? new Set() : new Set(users.map((u) => u.username)))
  const clearSel = () => setSel(new Set())

  async function createUser(e) {
    e.preventDefault()
    setErr('')
    if (!nu.trim() || np.length < 6) return setErr('Cần username + mật khẩu ≥ 6 ký tự.')
    setBusy(true)
    try {
      await apiAdminCreateUser(nu.trim(), np, nr)
      setNu(''); setNp(''); setNr('user')
      await loadUsers()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function importBulk() {
    setErr('')
    if (!bulkText.trim()) return setErr('Dán danh sách trước.')
    setBusy(true)
    try {
      const r = await apiAdminBulk(bulkText, bulkPass, bulkMode)
      setBulkRes(r)
      await loadUsers()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  // Đường chung của mọi thao tác. `targets` là mảng username.
  async function runAction(action, extra, targets) {
    const usernames = targets ?? [...sel]
    if (!usernames.length) return setErr('Chưa chọn tài khoản nào.')
    setErr(''); setActionRes(null); setIssued(null)
    setBusy(true)
    try {
      const r = await apiAdminBulkAction(action, usernames, extra)
      setActionRes({ action, ...r })
      const pw = r.results.filter((x) => x.password)
      if (pw.length) setIssued(pw)
      await loadUsers()
      return r
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function applyPassword() {
    if (passMode === 'same' && passValue.length < 6) return setErr('Mật khẩu tối thiểu 6 ký tự.')
    const r = await runAction(
      'password',
      passMode === 'random' ? { randomPassword: true } : { password: passValue }
    )
    if (r) { setPassOpen(false); setPassValue('') }
  }

  async function doDelete() {
    const targets = confirmDel.map((u) => u.username)
    setConfirmDel(null)
    await runAction('delete', {}, targets)
  }

  async function exportCsv(only) {
    setErr('')
    setBusy(true)
    try { await apiAdminExportUsers(only) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  const issuedText = issued ? issued.map((r) => `${r.username},${r.password}`).join('\n') : ''
  const copyIssued = () => navigator.clipboard?.writeText(issuedText)

  const fmtHours = (h) => (h ? `${h} h` : '—')

  const STATUS_LABEL = {
    deleted: 'đã xoá', locked: 'đã khoá', unlocked: 'đã mở', password: 'đã đổi pass',
    role: 'đã đổi vai trò', skipped: 'bỏ qua', error: 'lỗi',
  }

  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <header className="admin-head">
          <h2>Quản trị</h2>
          <div className="admin-tabs">
            <button className={tab === 'users' ? 'seg active' : 'seg'} onClick={() => setTab('users')}>Tài khoản</button>
            <button className={tab === 'sessions' ? 'seg active' : 'seg'} onClick={() => setTab('sessions')}>Thời lượng</button>
            <button className={tab === 'usage' ? 'seg active' : 'seg'} onClick={() => setTab('usage')}>Sử dụng</button>
          </div>
          <button className="ghost" onClick={onClose}><IcClose size={13} /> Đóng</button>
        </header>

        {err && <div className="error">{err}</div>}

        <div className="admin-body">
          {tab === 'users' && (
            <>
              <form className="admin-newuser" onSubmit={createUser}>
                <input placeholder="username" value={nu} onChange={(e) => setNu(e.target.value)} />
                <input placeholder="mật khẩu (≥6)" value={np} onChange={(e) => setNp(e.target.value)} />
                <select value={nr} onChange={(e) => setNr(e.target.value)}>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <button className="btn primary" disabled={busy}>＋ Tạo</button>
                <button type="button" className="ghost" onClick={() => setShowBulk((v) => !v)}>{showBulk ? <><IcMinus size={13} /> Ẩn import</> : <><IcArrowUp size={13} /> Import nhiều</>}</button>
                <button type="button" className="ghost" onClick={() => exportCsv([])} disabled={busy}><IcDownload size={13} /> Xuất CSV</button>
              </form>

              {showBulk && (
                <div className="admin-bulk">
                  <p className="hint">Mỗi dòng: <code>username</code> hoặc <code>username,password</code> hoặc <code>username,password,admin</code>. Thiếu password → dùng pass mặc định.</p>
                  <textarea
                    rows={5}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder={'an\nbinh,Matkhau123\nchi,Matkhau456,admin'}
                  />
                  <div className="admin-bulk-row">
                    <label className="lbl">Pass mặc định</label>
                    <input value={bulkPass} onChange={(e) => setBulkPass(e.target.value)} />
                  </div>
                  <div className="admin-bulk-row">
                    <label className="lbl">User đã có</label>
                    <label className="chk"><input type="radio" checked={bulkMode === 'skip'} onChange={() => setBulkMode('skip')} /> bỏ qua</label>
                    <label className="chk"><input type="radio" checked={bulkMode === 'update'} onChange={() => setBulkMode('update')} /> đặt lại mật khẩu</label>
                    <button className="btn primary" disabled={busy} onClick={importBulk}><IcArrowUp size={13} /> Import</button>
                  </div>
                  {bulkRes && (
                    <div className="admin-bulk-res">
                      <p className="hint">Tạo mới <b>{bulkRes.created}</b>{bulkRes.updated ? <> · cập nhật <b>{bulkRes.updated}</b></> : null} / {bulkRes.results.length} dòng.</p>
                      <ul className="plain">
                        {bulkRes.results.map((r, i) => (
                          <li key={i} className={`bulk-${r.status}`}>
                            {r.username || r.line} — {
                              r.status === 'created' ? `tạo (${r.role}${r.usedDefault ? ', pass mặc định' : ''})`
                                : r.status === 'updated' ? `đặt lại pass${r.role ? `, vai trò ${r.role}` : ''}${r.usedDefault ? ' (pass mặc định)' : ''}`
                                : r.status === 'exists' ? 'đã có, bỏ qua'
                                : `lỗi: ${r.error}`
                            }
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {sel.size > 0 && (
                <div className="admin-selbar">
                  <span className="selcount">Đã chọn <b>{sel.size}</b></span>
                  <button className="ghost" onClick={clearSel}>Bỏ chọn</button>
                  <span className="sep" />
                  <button className="ghost" disabled={busy} onClick={() => runAction('active', { active: 0 })}><IcLock size={13} /> Khoá</button>
                  <button className="ghost" disabled={busy} onClick={() => runAction('active', { active: 1 })}><IcUnlock size={13} /> Mở</button>
                  <button className="ghost" disabled={busy} onClick={() => setPassOpen((v) => !v)}><IcKey size={13} /> Đổi pass…</button>
                  <span className="sep" />
                  <span className="selcount">Vai trò</span>
                  <button className="ghost" disabled={busy} onClick={() => runAction('role', { role: 'admin' })}>→ admin</button>
                  <button className="ghost" disabled={busy} onClick={() => runAction('role', { role: 'user' })}>→ user</button>
                  <span className="sep" />
                  <button className="ghost" disabled={busy} onClick={() => exportCsv([...sel])}><IcDownload size={13} /> Xuất CSV</button>
                  <button className="ghost danger" disabled={busy} onClick={() => setConfirmDel(selected)}><IcTrash size={13} /> Xoá…</button>
                </div>
              )}

              {sel.size > 0 && passOpen && (
                <div className="admin-passbar">
                  <label className="chk"><input type="radio" checked={passMode === 'same'} onChange={() => setPassMode('same')} /> cùng một mật khẩu</label>
                  <input
                    placeholder="mật khẩu (≥6)"
                    value={passValue}
                    disabled={passMode !== 'same'}
                    onChange={(e) => setPassValue(e.target.value)}
                  />
                  <label className="chk"><input type="radio" checked={passMode === 'random'} onChange={() => setPassMode('random')} /> ngẫu nhiên mỗi người</label>
                  <button className="btn primary" disabled={busy} onClick={applyPassword}>Đặt cho {sel.size} tài khoản</button>
                </div>
              )}

              {issued && (
                <div className="admin-issued">
                  <p className="hint"><IcAlert size={13} /> Mật khẩu ngẫu nhiên chỉ hiện <b>một lần</b> — lưu lại trước khi đóng. Hệ thống mã hoá một chiều, không xem lại được.</p>
                  <textarea rows={Math.min(8, issued.length + 1)} readOnly value={issuedText} />
                  <div className="admin-bulk-row">
                    <button className="ghost" onClick={copyIssued}>Chép</button>
                    <button className="ghost" onClick={() => setIssued(null)}>Ẩn</button>
                  </div>
                </div>
              )}

              {actionRes && (
                <div className="admin-bulk-res admin-actionres">
                  <p className="hint">Xong <b>{actionRes.done}</b>/{actionRes.results.length} tài khoản.</p>
                  <ul className="plain">
                    {actionRes.results.map((r, i) => (
                      <li key={i} className={`bulk-${r.status === 'skipped' || r.status === 'error' ? r.status : 'created'}`}>
                        {r.username} — {STATUS_LABEL[r.status] || r.status}{r.error ? `: ${r.error}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="admin-tablewrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th className="chkcol"><input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Chọn tất cả" /></th>
                      <th>User</th><th>Vai trò</th><th>Trạng thái</th><th className="num">Login</th><th className="num">Lượt API</th><th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className={sel.has(u.username) ? 'row-sel' : undefined}>
                        <td className="chkcol"><input type="checkbox" checked={sel.has(u.username)} onChange={() => toggleOne(u.username)} aria-label={`Chọn ${u.username}`} /></td>
                        <td>{u.username}{u.id === me?.id && ' (bạn)'}</td>
                        <td>{u.role === 'admin' ? <span className="pill admin">admin</span> : 'user'}</td>
                        <td>{u.active ? <span className="pill ok">hoạt động</span> : <span className="pill off">khoá</span>}</td>
                        <td className="num">{u.logins}</td>
                        <td className="num">{u.calls}</td>
                        <td className="admin-actions">
                          <button className="ghost" disabled={busy || u.id === me?.id} onClick={() => runAction('active', { active: u.active ? 0 : 1 }, [u.username])}>{u.active ? 'Khoá' : 'Mở'}</button>
                          <button className="ghost" disabled={busy} onClick={() => { setSel(new Set([u.username])); setPassOpen(true) }}>Đổi pass</button>
                          <button className="ghost danger" disabled={busy || u.id === me?.id} onClick={() => setConfirmDel([u])}>Xoá</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === 'sessions' && (
            <div className="admin-tablewrap">
              <p className="hint">30 ngày gần nhất — thời lượng đăng nhập từng người.</p>
              <table className="admin-table">
                <thead><tr><th>User</th><th className="num">Số phiên</th><th className="num">Tổng giờ</th><th>Hoạt động gần nhất</th></tr></thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.username}><td>{s.username}</td><td className="num">{s.logins}</td><td className="num">{fmtHours(s.hours)}</td><td>{s.last_active || '—'}</td></tr>
                  ))}
                  {sessions.length === 0 && <tr><td colSpan={4} className="hint">Chưa có dữ liệu.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'usage' && (
            <div className="admin-tablewrap">
              <p className="hint">
                30 ngày gần nhất — lượt gọi AI từng người.
                {usage.pricingConfigured
                  ? ` Tổng chi phí: $${(usage.totalCost || 0).toFixed(3)}${usage.unpricedRows ? ` (+${usage.unpricedRows} dòng chưa có giá)` : ''}.`
                  : ' (pricing.js chưa điền giá — chỉ hiện số liệu thô.)'}
              </p>
              <table className="admin-table">
                <thead><tr><th>User</th><th>Model</th><th>Loại</th><th className="num">Lượt</th><th className="num">Ảnh</th><th className="num">Tokens</th>{usage.pricingConfigured && <th className="num">$</th>}</tr></thead>
                <tbody>
                  {usage.rows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.username}</td><td>{r.model}</td><td>{r.kind}</td>
                      <td className="num">{r.calls}</td><td className="num">{r.images || 0}</td>
                      <td className="num">{(r.prompt_tokens || 0) + (r.output_tokens || 0)}</td>
                      {usage.pricingConfigured && <td className="num">{r.priced ? `$${r.cost.toFixed(3)}` : '—'}</td>}
                    </tr>
                  ))}
                  {usage.rows.length === 0 && <tr><td colSpan={7} className="hint">Chưa có dữ liệu.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Xoá là thao tác không lùi lại được VÀ kéo theo số liệu báo cáo, nên
            phải nhìn thấy đúng cái sắp mất trước khi bấm — không dùng confirm() trống. */}
        {confirmDel && (
          <div className="admin-confirm" onClick={() => setConfirmDel(null)}>
            <div className="admin-confirm-box" onClick={(e) => e.stopPropagation()}>
              <h3><IcAlert size={15} /> Xoá {confirmDel.length} tài khoản?</h3>
              <ul className="plain confirm-list">
                {confirmDel.map((u) => (
                  <li key={u.id}>
                    <b>{u.username}</b>
                    {u.role === 'admin' && <span className="pill admin">admin</span>}
                    <span className="hint"> — {u.logins} phiên · {u.calls} lượt API</span>
                  </li>
                ))}
              </ul>
              <p className="warn">
                Số liệu thời lượng đăng nhập và chi phí API của những người này sẽ <b>mất vĩnh viễn</b>,
                tổng chi phí 30 ngày sẽ giảm tương ứng. Muốn giữ số liệu thì <b>Khoá</b> thay vì xoá.
              </p>
              <div className="admin-confirm-row">
                <button className="ghost" onClick={() => setConfirmDel(null)}>Huỷ</button>
                <button className="btn danger" disabled={busy} onClick={doDelete}><IcTrash size={13} /> Xoá vĩnh viễn</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
