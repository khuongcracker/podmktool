import { useEffect, useState } from 'react'
import { CHANGELOG, CURRENT_VERSION } from './changelog.js'
import { IcClose, IcSparkle } from './Icons.jsx'
import { t, getLang, subscribeLang } from './i18n.js'

// "What's new" — changelog cho người dùng, ngay trong app.
//
// Vì sao không phải một trang web riêng: người dùng sẽ không bao giờ mở nó.
// Thứ họ mở là cái tool. Nên thông báo phải đuổi theo họ, đúng một lần, ngay
// lúc họ vừa vào sau khi tool đổi.
//
// SONG NGỮ: cả khung lẫn nội dung đều đổi theo cờ ngôn ngữ của giao diện.
// Đổi cờ lúc bảng đang mở thì bảng đổi theo ngay — subscribeLang lo việc đó.
//
// Repo công khai chỉ in ra bản tiếng Anh (scripts/gen-changelog.mjs), nên phần
// `en` phải luôn đầy đủ, kể cả khi cả team đọc tiếng Việt.

const LS_SEEN = 'seen_changelog'

/** Bôi đậm phần nằm giữa **…** — đủ cho changelog, khỏi kéo cả thư viện markdown. */
function RichText({ text }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? <b key={i}>{part.slice(2, -2)}</b>
          : <span key={i}>{part}</span>
      )}
    </>
  )
}

const KIND_KEY = { new: 'wn.new', fix: 'wn.fix', warn: 'wn.warn' }

/** Đã xem tới bản nào. Trả null nếu chưa từng lưu (người dùng hoàn toàn mới). */
function readSeen() {
  try { return localStorage.getItem(LS_SEEN) } catch (_) { return null }
}
export function markSeen() {
  try { localStorage.setItem(LS_SEEN, CURRENT_VERSION) } catch (_) {}
}

/** Có bản mới mà người này chưa xem không.
 *
 *  CỐ Ý trả false với người chưa từng lưu gì: người mới thì cái gì cũng mới,
 *  quăng changelog vào mặt họ ngay lần đầu đăng nhập là làm phiền chứ không
 *  phải thông báo. Chỉ đánh động người ĐÃ dùng bản cũ. */
export function hasUnseenUpdate() {
  const seen = readSeen()
  if (seen === null) { markSeen(); return false }
  return seen !== CURRENT_VERSION
}

export default function WhatsNew({ onClose, build }) {
  // Vẽ lại khi user đổi cờ — nội dung changelog nằm ngoài React nên phải tự
  // đăng ký, không thì đổi ngôn ngữ mà bảng vẫn đứng nguyên tiếng cũ.
  const [lang, setLangState] = useState(getLang())
  useEffect(() => subscribeLang(setLangState), [])
  const L = (v) => (typeof v === 'string' ? v : v?.[lang] ?? v?.en ?? '')

  return (
    <div className="admin-overlay" onClick={onClose}>
      <div className="whatsnew" onClick={(e) => e.stopPropagation()}>
        <header className="admin-head">
          <h2><IcSparkle size={15} /> {t('wn.title')}</h2>
          <span className="wn-ver">v{CURRENT_VERSION}</span>
          <button className="ghost" onClick={onClose}><IcClose size={13} /> {t('wn.close')}</button>
        </header>

        <div className="wn-body">
          {CHANGELOG.map((rel, i) => (
            <section className={i === 0 ? 'wn-rel latest' : 'wn-rel'} key={rel.version}>
              <div className="wn-relhead">
                <span className="wn-num">v{rel.version}</span>
                {i === 0 && <span className="pill ok">{t('wn.current')}</span>}
                <span className="wn-title">{L(rel.title)}</span>
                <span className="spread" />
                <span className="wn-date">{L(rel.date)}</span>
              </div>
              <ul className="plain wn-items">
                {rel.items.map((it, k) => (
                  <li key={k} className={`wn-item ${it.kind}`}>
                    <span className="wn-tag">{t(KIND_KEY[it.kind])}</span>
                    <span><RichText text={L(it)} /></span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        {/* Mã bản dựng — để lúc báo lỗi chép nguyên vào, đỡ phải đoán bản nào. */}
        {build?.commit && (
          <footer className="wn-foot">
            {t('wn.build')} <code>{build.commit}</code>
            {build.env === 'local' && ` · ${t('wn.local')}`}
          </footer>
        )}
      </div>
    </div>
  )
}
