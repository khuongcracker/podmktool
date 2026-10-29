import { useState } from 'react'
import { apiLogin } from './api.js'
import { t } from './i18n.js'
import EnvBadge from './EnvBadge.jsx'

// Không có đăng ký — tài khoản do admin cấp bằng `server/npm run cli -- add`.
export default function Login({ onLogin, notice = '', build = null }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      onLogin(await apiLogin(username.trim(), password))
    } catch (err) {
      setError(err.message)
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <span className="logo">◆</span>
          <div className="brand-text">
            <div className="title">Podmktool <EnvBadge build={build} /></div>
            <div className="subtitle">{t('auth.title')}</div>
          </div>
        </div>

        {notice && <div className="login-notice">{notice}</div>}

        <label className="lbl">{t('auth.username')}</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label className="lbl">{t('auth.password')}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        <button className="btn primary" type="submit" disabled={busy || !username || !password}>
          {busy ? t('auth.submitting') : t('auth.submit')}
        </button>

        {error && <div className="error">{error}</div>}
        <p className="hint">{t('auth.noSignup')}</p>
      </form>
    </div>
  )
}
