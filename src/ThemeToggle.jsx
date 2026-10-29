import { useEffect, useState } from 'react'
import { getTheme, getThemePref, followSystem, toggleLightDark, subscribeTheme } from './theme.js'
import { t } from './i18n.js'

// HAI nút, không phải một nút ba nấc.
//
// Bản cũ xoay vòng system → light → dark. Vấn đề: nấc 'system' trông y hệt nấc
// 'light' hoặc 'dark', tuỳ máy user để gì. Máy để tối thì bấm từ 'dark' sang
// 'system' KHÔNG đổi gì trên màn hình — user tưởng nút hỏng, bấm tiếp, thành ra
// chiều này một lần bấm, chiều kia hai lần.
//
// Tách ra thì mỗi nút trả lời một câu hỏi riêng: "ai quyết định tông?" và "tông
// nào?". Nút nào đang cầm trịch thì sáng lên.
//
// CỐ Ý KHÔNG disable nút còn lại, dù nó trông mờ đi: disable thật thì muốn đổi
// tông lúc đang bám máy phải bấm hai lần (nhả máy ra, rồi mới đổi) — đúng cái
// lỗi hai-lần-bấm mà việc tách nút này sinh ra để chữa. Nút mờ ở đây nghĩa là
// "đang không cầm trịch", bấm vào là nó cầm, ngay trong một lần.

function IconSun() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
    </svg>
  )
}
function IconMoon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2z" />
    </svg>
  )
}
function IconAuto() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 3.6a8.4 8.4 0 0 1 0 16.8z" fill="currentColor" stroke="none" />
    </svg>
  )
}


export default function ThemeToggle() {
  const [pref, setPref] = useState(getThemePref())
  const [active, setActive] = useState(getTheme())

  useEffect(() => subscribeTheme((next, nextPref) => {
    setActive(next)
    setPref(nextPref)
  }), [])

  const auto = pref === 'system'
  const activeLabel = active === 'dark' ? t('theme.dark') : t('theme.light')
  const otherLabel = active === 'dark' ? t('theme.light') : t('theme.dark')

  const autoTitle = auto
    ? `${t('theme.system')} · ${activeLabel}`
    : `${t('theme.switch')} — ${t('theme.system')}`
  const manualTitle = auto
    ? `${t('theme.switch')} — ${otherLabel}`
    : `${activeLabel} · ${t('theme.switch')} — ${otherLabel}`

  return (
    <div className="theme-group" role="group" aria-label={t('theme.switch')}>
      <button
        className={auto ? 'theme-toggle on' : 'theme-toggle'}
        onClick={followSystem}
        aria-pressed={auto}
        title={autoTitle}
        aria-label={autoTitle}
      >
        <IconAuto />
      </button>
      <button
        className={auto ? 'theme-toggle' : 'theme-toggle on'}
        onClick={toggleLightDark}
        aria-pressed={!auto}
        title={manualTitle}
        aria-label={manualTitle}
      >
        {active === 'dark' ? <IconMoon /> : <IconSun />}
      </button>
    </div>
  )
}
