import { useState, useEffect } from 'react'
import NewMockupTab from './NewMockupTab.jsx'
import ContentTab from './ContentTab.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
// RedesignTab tạm khoá — import lại khi mở: import RedesignTab from './RedesignTab.jsx'
import ProgressBar from './ProgressBar.jsx'
import Lightbox from './Lightbox.jsx'
import Login from './Login.jsx'
import AdminPanel from './AdminPanel.jsx'
import RefSlots from './RefSlots.jsx'
import { fileToBase64, fetchProductImage } from './shared.js'
import { extractImageUrlFromUrl } from './providers/gemini.js'
import { getChoice, setModel, getModelMeta, applyRole, visibleModels, canPickModel } from './providers/models.js'
import { apiMe, apiLogout, setAuthLostHandler, apiFetchPage, apiBuild } from './api.js'
import { listSessions, deleteSession } from './sessions.js'
import { t, getLang, setLang, subscribeLang, LANGS } from './i18n.js'
import { FLAG_BY_CODE } from './Flags.jsx'
import EnvBadge from './EnvBadge.jsx'
import WhatsNew, { hasUnseenUpdate, markSeen } from './WhatsNew.jsx'
import { CURRENT_VERSION } from './changelog.js'
import ThemeToggle from './ThemeToggle.jsx'
import { IcImage, IcFacebook, IcLock, IcGear, IcDiamond, IcPlus, IcLogout } from './Icons.jsx'

// Podmktool — one Product URL input, two pipeline branches (per the
// whiteboard): New mockup line (gold) and Redesign line (green). Both share
// the same source: the product link / reference image below.
//
// Từ 2026-08-11: API key KHÔNG còn ở frontend. Phải đăng nhập, mọi lượt gọi AI
// đi qua backend (`server/`) — server giữ key và ghi lại usage.
export default function App() {
  const [tab, setTab] = useState('mockup') // 'mockup' | 'redesign' | 'content'

  // Auto (1 nút chạy hết) hay Manual (từng bước tự chạy). DÙNG CHUNG mọi tab —
  // trước đây mỗi tab một kiểu nên user phải học lại. Nhớ qua localStorage vì
  // ai quen tay nào thường ở luôn chế độ đó.
  const [flow, setFlow] = useState(() => {
    try { return localStorage.getItem('ui_flow') === 'manual' ? 'manual' : 'auto' } catch (_) { return 'auto' }
  })
  const pickFlow = (next) => {
    setFlow(next)
    try { localStorage.setItem('ui_flow', next) } catch (_) {}
  }

  // Kho ảnh đã CHỌN gửi sang Content — user bấm "→ FB" trên tile mockup mới thêm.
  // Persist: bên New Mockup gen ảnh khác cũng KHÔNG mất (khác gallery live cũ).
  const [contentPicks, setContentPicks] = useState([]) // {id, dataUrl}
  const sendToContent = (dataUrl) =>
    setContentPicks((g) => (g.some((x) => x.dataUrl === dataUrl) ? g : [{ id: 'ap_' + Math.random().toString(36).slice(2), dataUrl }, ...g].slice(0, 100)))
  const removeContentPick = (id) => setContentPicks((g) => g.filter((x) => x.id !== id))
  // Ảnh nào đã đẩy sang Content FB — tab Mockup cần biết để không cho gửi lại
  // và để đánh dấu. So bằng dataUrl vì đó là thứ duy nhất định danh được ảnh.
  const sentUrls = new Set(contentPicks.map((x) => x.dataUrl))

  // Lịch sử phiên: meta ở đây (nhẹ), bản đầy đủ kèm ảnh nằm trong IndexedDB.
  const [sessions, setSessions] = useState([])
  const [openSession, setOpenSession] = useState(null) // {id, n} — n để mỗi lần bấm là một lần mở mới
  const [askNew, setAskNew] = useState(false)  // đang hỏi "tạo phiên mới?"
  const [resetReq, setResetReq] = useState(0)  // tăng 1 nấc là các tab tự xoá sạch state

  const [user, setUser] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  // Lý do bị đá ra, hiện ở màn đăng nhập.
  const [authNotice, setAuthNotice] = useState('')
  // Danh tính bản chạy — local hay deploy.
  const [build, setBuild] = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [hasNew, setHasNew] = useState(false)

  const [url, setUrl] = useState('')

  // Nguồn thông tin sản phẩm cho tab Mockup — 2 chức năng chung 1 tab, bật/tắt
  // theo input: 'link' = Link store → cào từ URL; 'text' = dán cụm info sản phẩm
  // (tiếng Việt) → AI breakdown. Upload ảnh dùng cho CẢ HAI (làm reference gen).
  const [source, setSource] = useState('link') // 'link' | 'text'
  const [pasteText, setPasteText] = useState('')

  // 3 ô ảnh tham chiếu, KHÔNG phân biệt chính/phụ nữa.
  // Pipeline vẫn cần một ảnh "chính" nên lấy ô CÓ ẢNH đầu tiên — trước đây khoá
  // cứng vào ô 0, ai điền ô 2 mà bỏ trống ô 1 là pipeline coi như không có ref.
  const [refImages, setRefImages] = useState([null, null, null])
  const refImage = refImages.find(Boolean) || null
  const extraRefs = refImages.filter(Boolean).slice(1)
  const setSlot = (i, img) =>
    setRefImages((prev) => prev.map((x, j) => (j === i ? img : x)))
  // Pipeline gọi cái này khi tự cào được ảnh sản phẩm: đặt vào ô TRỐNG đầu
  // tiên, không đè ảnh người dùng đã tự tải lên.
  const setRefImage = (img) => {
    const i = refImages.findIndex((x) => !x)
    setSlot(i === -1 ? 0 : i, img)
  }

  // Ảnh của trang, tải một lần rồi dùng lại; `usedUrls` để không lấy trùng ảnh
  // đã nằm ở ô khác — đúng yêu cầu "không trùng ảnh mặc định".
  const [pageImages, setPageImages] = useState([])
  const [usedUrls, setUsedUrls] = useState([])
  const [busySlot, setBusySlot] = useState(null)

  const [busy, setBusy] = useState('')
  const [inputError, setInputError] = useState('')
  const [zoomRef, setZoomRef] = useState(null)

  // Lựa chọn model sống ở module state (providers/models.js) vì các hàm provider
  // không phải hook. State này chỉ để React vẽ lại dropdown sau khi đổi.
  // Ngôn ngữ cũng sống ở module state (prompt cần đọc được ngoài React).
  const [lang, setLangState] = useState(getLang())
  useEffect(() => subscribeLang(setLangState), [])

  const [modelChoice, setModelChoice] = useState(getChoice())
  function pickModel(kind, id) {
    setModel(kind, id)
    setModelChoice(getChoice())
  }
  const textMeta = getModelMeta('text')
  const imageMeta = getModelMeta('image')

  useEffect(() => { listSessions().then(setSessions) }, [])

  // Dán link xong thì tự lấy ảnh về. Chờ 800ms để không gọi mỗi lần gõ một ký tự.
  useEffect(() => {
    if (source !== 'link') return
    const u = (url || '').trim()
    if (!/^https?:\/\/\S+\.\S+/.test(u)) return
    if (refImages.every(Boolean)) return
    const id = setTimeout(() => autoFillRefs(u), 800)
    return () => clearTimeout(id)
  }, [url, source])

  // Khôi phục phiên khi mở app (cookie httpOnly nên phải hỏi server).
  useEffect(() => {
    apiMe()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true))
  }, [])

  // Khoá model theo vai trò. Phải chạy TRƯỚC khi user bấm chạy lượt đầu: ai lỡ
  // chọn model khác từ hôm trước sẽ được kéo về mặc định, thay vì gọi lên rồi
  // ăn 403 giữa pipeline.
  useEffect(() => {
    applyRole(user?.role)
    setModelChoice(getChoice())
  }, [user])

  // Phiên có thể hết hạn giữa lúc đang chạy pipeline — đá về màn đăng nhập
  // thay vì để user nhìn một chuỗi lỗi khó hiểu.
  useEffect(() => {
    setAuthLostHandler((reason) => { setAuthNotice(reason || ''); setUser(null) })
  }, [])

  // Đóng dấu bản chạy lên cả tên tab trình duyệt: mở local và deploy cạnh nhau
  // thì dải tab là chỗ đầu tiên mắt nhìn, trước cả nội dung trang.
  useEffect(() => {
    apiBuild().then(setBuild).catch(() => {})
  }, [])
  useEffect(() => {
    document.title = build?.env === 'local' ? 'LOCAL · Podmktool' : 'Podmktool'
  }, [build])

  // Vừa đăng nhập xong mà tool đã đổi kể từ lần trước họ dùng thì MỞ THẲNG
  // bảng "Có gì mới", đúng một lần cho mỗi bản. Để chấm đỏ chờ người ta tự bấm
  // thì phần lớn sẽ không bấm, và tuần sau vẫn hỏi "sao nút này biến mất".
  useEffect(() => {
    if (!user) return
    if (hasUnseenUpdate()) { setHasNew(true); setShowNew(true) }
  }, [user])

  function closeWhatsNew() {
    markSeen()
    setHasNew(false)
    setShowNew(false)
  }

  async function doLogout() {
    try {
      await apiLogout()
    } finally {
      setUser(null)
    }
  }

  async function handleUpload(i, file) {
    setInputError('')
    setSlot(i, await fileToBase64(file))
  }

  function removeSlot(i) {
    setSlot(i, null)
  }
  // Tự lấy ảnh tham chiếu từ trang sản phẩm khi có link — người dùng không phải
  // bấm gì. Trước đây mỗi ô có một nút "Từ link" bé xíu; bỏ nút, làm tự động.
  //
  // Khử trùng hai tầng, vì khử theo URL thôi là không đủ:
  //   1. theo TÊN FILE — cùng một ảnh phục vụ ở nhiều URL/kích thước.
  //   2. theo NỘI DUNG (base64) — ảnh có thể đã vào ô khác bằng đường upload,
  //      không có URL nào để so.
  // Cố ý gom cả vòng lặp vào một hàm và dùng biến CỤC BỘ: gọi lặp hàm cũ thì
  // mỗi lượt đọc `refImages`/`usedUrls` còn cũ nên điền trùng ảnh.
  const baseName = (u) => (u.split('/').pop() || u).split('?')[0].toLowerCase()

  async function autoFillRefs(u) {
    try {
      let list = pageImages
      if (!list.length) {
        const page = await apiFetchPage(u)
        list = page.images || []
        if (!list.length) {
          const one = await extractImageUrlFromUrl(u)
          list = one ? [one] : []
        }
        setPageImages(list)
      }

      const out = [...refImages]
      const seenName = new Set(usedUrls.map(baseName))
      const seenData = new Set(out.filter(Boolean).map((x) => x.base64))
      const used = []

      for (const cand of list) {
        const idx = out.findIndex((x) => !x)
        if (idx === -1) break
        const bn = baseName(cand)
        if (seenName.has(bn)) continue
        seenName.add(bn)
        setBusySlot(idx)
        let img
        try {
          img = await fetchProductImage(cand)
        } catch (_) {
          continue // một ảnh hỏng không được giết cả lượt
        }
        if (seenData.has(img.base64)) continue
        seenData.add(img.base64)
        out[idx] = img
        used.push(cand)
        setRefImages([...out])
      }
      if (used.length) setUsedUrls((prev) => [...prev, ...used])
    } catch (_) {
      // Chạy ngầm thì hỏng cũng không la — người dùng vẫn tự tải ảnh lên được.
    } finally {
      setBusySlot(null)
    }
  }

  // Đưa một ảnh đã gen vào ô trống đầu tiên — đường vào không phụ thuộc link,
  // dùng khi trang sản phẩm không có đủ ảnh.
  function useAsRef(img, slot) {
    const target = slot ?? refImages.findIndex((x) => !x)
    if (target === -1) return setInputError(t('ref.allFull'))
    setInputError('')
    setSlot(target, img)
  }

  const shared = {
    flow,
    url,
    source,
    pasteText,
    refImage,
    extraRefs,
    setRefImage,
    useAsRef,
    refSlotsFull: refImages.every(Boolean),
    goMockupTab: () => setTab('mockup'),
    sendToContent,
  }

  if (!authChecked) return <div className="boot">{t('app.checking')}</div>
  if (!user) return <Login onLogin={(u) => { setAuthNotice(''); setUser(u) }} notice={authNotice} build={build} />

  // Ngày giờ lưu, dạng ngắn cho vừa cột 220px; bản đầy đủ nằm ở tooltip.
  const pad = (x) => String(x).padStart(2, '0')
  function when(at) {
    const d = new Date(at)
    const hhmm = pad(d.getHours()) + ':' + pad(d.getMinutes())
    const sameYear = d.getFullYear() === new Date().getFullYear()
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + (sameYear ? '' : '/' + d.getFullYear()) + ' ' + hhmm
  }
  const whenFull = (at) => new Date(at).toLocaleString()

  // Bấm "Phiên mới" là VỨT hết việc đang làm nên phải hỏi trước — bấm nhầm mà
  // mất cả lượt vừa gen thì không lấy lại được.
  function newSession() {
    setOpenSession(null)
    setUrl('')
    setPasteText('')
    setRefImages([null, null, null])
    setPageImages([])
    setUsedUrls([])
    setInputError('')
    setResetReq((x) => x + 1) // các tab tự xoá content/phối cảnh/prompt/output
    setAskNew(false)
  }

  async function dropSession(id) {
    await deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
    if (openSession?.id === id) setOpenSession(null)
  }

  // Ảnh tham chiếu + model là cài đặt DÙNG CHUNG cho mọi tab, nên App giữ
  // state và đưa xuống cột phải của tab đang mở dưới dạng JSX.
  // Ảnh tham chiếu nằm NGAY trong ô nhập cạnh link, không còn ở cột phải:
  // link và ref cùng trả lời một câu "sản phẩm này là gì".
  const refSlot = (
    <RefSlots
      images={refImages}
      busySlot={busySlot}
      onUpload={handleUpload}
      onRemove={removeSlot}
      onZoom={(d) => setZoomRef(d)}
    />
  )

  const cfgModels = (
    <div className="fold">
      <span className="ob-label"><IcGear /> {t('cfg.title')}</span>
      <label className="lbl">{t('model.text')}</label>
      {canPickModel() ? (
        <select className="model-select" value={modelChoice.text} onChange={(e) => pickModel('text', e.target.value)}>
          {visibleModels('text').map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      ) : (
        /* User thường: hiện TÊN model đang chạy chứ không giấu biệt. Ô select
           khoá cứng trông như app hỏng; không hiện gì thì họ không biết mình
           đang chạy bằng gì để mà báo lỗi. */
        <div className="model-fixed">{textMeta.label}</div>
      )}
      <p className="hint">{textMeta.note}</p>
      <label className="lbl">{t('model.image')}</label>
      {canPickModel() ? (
        <select className="model-select" value={modelChoice.image} onChange={(e) => pickModel('image', e.target.value)}>
          {visibleModels('image').map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      ) : (
        <div className="model-fixed">{imageMeta.label}</div>
      )}
      <p className="hint">{imageMeta.note}</p>
    </div>
  )

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">
            <span className="logo"><IcDiamond size={16} /></span>
            <div className="brand-text">
              <div className="title">Podmktool <EnvBadge build={build} /></div>
              <div className="subtitle">{t('app.subtitle')}</div>
            </div>
          </div>
          <div className="tabs">
            <button className={tab === 'mockup' ? 'tab gold active' : 'tab gold'} onClick={() => setTab('mockup')}>
              <IcImage /> {t('tab.mockup')}
            </button>
            <button className={tab === 'content' ? 'tab blue active' : 'tab blue'} onClick={() => setTab('content')}>
              <IcFacebook /> {t('tab.content')}
            </button>
            {/* Redesign tạm khoá — pipeline chưa đạt, mở lại khi hoàn thiện */}
            <button className="tab green" disabled title={t('tab.locked')}>
              <IcLock /> {t('tab.redesign')}
            </button>
          </div>
        </div>
        <div className="who">
          <button
            className={hasNew ? 'ver-btn has-new' : 'ver-btn'}
            onClick={() => setShowNew(true)}
            title={hasNew ? t('wn.tipNew') : t('wn.tip')}
          >
            v{CURRENT_VERSION}
          </button>
          <ThemeToggle />
          <div className="lang" title={t('lang.switch')}>
            {LANGS.map((l) => {
              const Flag = FLAG_BY_CODE[l.code]
              return (
                <button
                  key={l.code}
                  className={lang === l.code ? 'flag active' : 'flag'}
                  onClick={() => setLang(l.code)}
                  aria-label={l.label}
                  title={l.label}
                >
                  <Flag />
                </button>
              )
            })}
          </div>
          <span className="who-name">
            {user.username}
            {user.role === 'admin' && <span className="badge">admin</span>}
          </span>
          {user.role === 'admin' && (
            <button className="ico ghost" title="Quản trị" aria-label="Quản trị" onClick={() => setShowAdmin(true)}><IcGear /></button>
          )}
          <button className="ico ghost" title={t('auth.logout')} aria-label={t('auth.logout')} onClick={doLogout}><IcLogout /></button>
        </div>
      </header>

      {showAdmin && <AdminPanel onClose={() => setShowAdmin(false)} me={user} />}
      {showNew && <WhatsNew onClose={closeWhatsNew} build={build} />}

      {/* ===== Ba cột: phiên · dòng làm việc · điều khiển =====
           Cả hai tab luôn mounted, tab không dùng thì ẩn — đổi tab KHÔNG mất
           link, ref hay ảnh đã gen. Mỗi tab tự trả về <section.mid> và
           <aside.cfg>, App chỉ xếp chúng vào lưới. */}
      {inputError && <div className="error">{inputError}</div>}

      <div className="shell">
        <aside className="rail">
          <div className="rail-top">
            <button className="btn" onClick={() => setAskNew(true)}>
              <IcPlus /> {t('rail.new')}
            </button>
          </div>
          <div className="rail-list">
            {sessions.length === 0 ? (
              <p className="rail-empty">{t('rail.empty')}</p>
            ) : (
              sessions.map((s) => (
                <button
                  key={s.id}
                  className={openSession?.id === s.id ? 'rail-item active' : 'rail-item'}
                  title={s.name + ' — ' + whenFull(s.at)}
                  aria-current={openSession?.id === s.id ? 'true' : undefined}
                  onClick={() => setOpenSession({ id: s.id, n: Date.now() })}
                >
                  <span className="th">
                    {s.thumb ? <img src={s.thumb} alt="" /> : <IcDiamond size={14} />}
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span className="nm">{s.name}</span>
                    <span className="mt" title={whenFull(s.at)}>{when(s.at)} · {s.count} {t('rail.images')}</span>
                  </span>
                  <span
                    className="rail-del"
                    title={t('rail.del')}
                    onClick={(e) => { e.stopPropagation(); dropSession(s.id) }}
                  >×</span>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ErrorBoundary trả thẳng children (không bọc thêm thẻ) nên đặt trong
            lưới vẫn an toàn — cột không bị lệch. */}
        <ErrorBoundary name="Mockup">
          <NewMockupTab
            {...shared}
            hidden={tab !== 'mockup'}
            openSession={openSession}
            resetReq={resetReq}
            sentUrls={sentUrls}
            onSessionSaved={(meta) => {
              setSessions((prev) => [meta, ...prev.filter((x) => x.id !== meta.id)])
              // Chạy xong là phiên đó đang mở — cột trái phải sáng đúng dòng ấy,
              // không thì không ai biết mình đang đứng ở phiên nào.
              setOpenSession({ id: meta.id, n: 0 })
            }}
            setFlow={pickFlow}
            setUrl={setUrl}
            setSource={setSource}
            setPasteText={setPasteText}
            refSlot={refSlot}
            cfgBottom={cfgModels}
          />
        </ErrorBoundary>

        <ErrorBoundary name="Content FB">
          <ContentTab
            {...shared}
            hidden={tab !== 'content'}
            resetReq={resetReq}
            setFlow={pickFlow}
            gallery={contentPicks}
            onRemovePick={removeContentPick}
            cfgBottom={cfgModels}
          />
        </ErrorBoundary>
      </div>

      {askNew && (
        <div className="confirm-back" onClick={() => setAskNew(false)}>
          <div className="confirm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <h3>{t('rail.newAsk')}</h3>
            <p>{t('rail.newAskNote')}</p>
            <div className="confirm-acts">
              <button className="btn ghost-btn" onClick={() => setAskNew(false)}>{t('rail.cancel')}</button>
              <button className="btn primary" onClick={newSession}>{t('rail.newYes')}</button>
            </div>
          </div>
        </div>
      )}

      {zoomRef && <Lightbox src={zoomRef} onClose={() => setZoomRef(null)} />}
      {busySlot !== null && <ProgressBar label={t('progress.fetchImage')} percent={null} />}
    </div>
  )
}
