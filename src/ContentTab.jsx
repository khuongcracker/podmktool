import { useState, useEffect } from 'react'
import { t } from './i18n.js'
import { breakdownAdBrief, generateAdCreative } from './providers/gemini.js'
import { LOCK_RATIO } from './shared.js'
import Lightbox from './Lightbox.jsx'
import { IcSparkle, IcBolt, IcPlayFrom, IcDownload, IcCheck, IcClose, IcTrash } from './Icons.jsx'

// ============================================================================
// Content FB — biến 1 mockup đã gen thành creative chạy quảng cáo Facebook.
//
// 3 input (chỉ MOCKUP bắt buộc):
//   1. Mockup base — từ New Mockup (gallery chung) hoặc upload. Đã có sẵn
//      product / scene / người / background — GIỮ NGUYÊN, chỉ overlay chữ.
//   2. Brief (1 ô master) — mô tả cần add gì; tool tự breakdown ra các lớp
//      (headline / text / helptext / badge), skip lớp không nhắc tới. Trống →
//      AI tự đề xuất từ mockup.
//   3. Ref style (upload, optional) — style chữ/badge bám theo.
//
// Gen 1–4 mẫu (mỗi mẫu 1 biến thể bố cục). Chữ tiếng Anh (rủi ro chính tả thấp).
// ============================================================================

const FB_RATIOS = [
  ['1:1', 'content.ratioSquare', 'content.ratioSquareNote'],
  ['4:5', 'content.ratioPortrait', 'content.ratioPortraitNote'],
  ['16:9', 'content.ratioLandscape', 'content.ratioLandscapeNote'],
]

// Biến thể bố cục khi sinh nhiều hơn 1 mẫu.
//
// Bộ cũ chỉ khác nhau CHỖ ĐẶT badge ("góc này" vs "góc kia") — cùng một ảnh
// nền, cùng một câu chữ, thì bốn tấm ra gần như một, sinh 4 chỉ dùng được 1.
// Bộ này khác nhau trên NHIỀU TRỤC cùng lúc: có/không dải màu đặc, cỡ chữ,
// hướng xếp, và lượng chữ hiện ra. Khác trục thì mắt mới thấy là khác.
const VARIATIONS = [
  'a solid colour band across the EMPTY TOP strip with the headline set very large inside it, sub-text small directly beneath, and the badge small in a bottom corner',
  'NO colour band at all — headline and sub-text stacked vertically down ONE empty side at medium size, strongly left-aligned, with the badge in the opposite corner',
  'deliberately MINIMAL — no large headline block; show only the badge in one corner plus one short line of helptext in a margin, letting the photo breathe',
  'a solid bar across the EMPTY BOTTOM with the headline inside it, the sub-text on the same bar in much smaller type, and the badge floating in a top corner',
]

// Vị trí helptext: Auto + 6 mép/góc (bỏ giữa vì thường trùng sản phẩm).
// [value, [ngang, dọc]] — null = Auto.
const LOCATIONS = [
  ['auto', null], ['top-left', ['l', 't']], ['top', ['c', 't']], ['top-right', ['r', 't']],
  ['bottom-left', ['l', 'b']], ['bottom', ['c', 'b']], ['bottom-right', ['r', 'b']],
]

// Icon vị trí: KHUNG + VẠCH ở đúng góc/cạnh.
// Không dùng chấm cũng không dùng mũi tên. Mũi tên nói "đi về hướng đó"; chấm
// nói "có gì đó ở đây". Thứ cần nói là "DÒNG CHỮ nằm ở chỗ này trong khung
// ảnh" — nên vẽ đúng một vạch, vì chữ trông giống một vạch.
function LocIcon({ at }) {
  const frame = <rect x="2" y="3" width="16" height="14" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.5" />
  if (!at) {
    // Auto = vạch đứt trải ngang: chỗ nào cũng có thể, để AI chọn.
    return (
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
        {frame}
        <line x1="5" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1.5 2.4" />
      </svg>
    )
  }
  const [sx, sy] = at
  const y = sy === 't' ? 6.5 : 13.5
  const x1 = sx === 'l' ? 4.5 : sx === 'r' ? 10.5 : 7.5
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true">
      {frame}
      <line x1={x1} y1={y} x2={x1 + 5} y2={y} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function dataUrlToImage(dataUrl) {
  const m = /^data:(.*?);base64,(.*)$/.exec(dataUrl || '')
  if (!m) return null
  return { mimeType: m[1] || 'image/png', base64: m[2] }
}

export default function ContentTab({ flow = 'auto', setFlow, gallery = [], onRemovePick, cfgBottom, hidden, resetReq }) {
  const [uploads, setUploads] = useState([]) // {id, dataUrl}
  const [baseId, setBaseId] = useState('') // 1 base duy nhất
  const [master, setMaster] = useState('')
  const [headline, setHeadline] = useState('')
  const [text, setText] = useState('')
  const [helptext, setHelptext] = useState('')
  const [helptextStyle, setHelptextStyle] = useState('') // kiểu trình bày helptext
  const [helptextLoc, setHelptextLoc] = useState('auto') // vị trí helptext
  const [overallRef, setOverallRef] = useState(null) // ref tổng thể {dataUrl, mimeType, base64}
  const [helptextRef, setHelptextRef] = useState(null) // ref riêng cho helptext
  const [ratio, setRatio] = useState('1:1')
  const [count, setCount] = useState(2)
  const [results, setResults] = useState([]) // {status, dataUrl, error}
  const [analyzing, setAnalyzing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(null)
  const [showAdv, setShowAdv] = useState(false) // Ref style + tỉ lệ — gập, không bắt buộc

  // "Phiên mới" ở cột trái: xoá luôn kết quả bên này cho sạch.
  useEffect(() => {
    if (!resetReq) return
    setResults([])
    setMaster(''); setHeadline(''); setText(''); setHelptext(''); setHelptextStyle('')
    setError('')
  }, [resetReq])

  const bases = [...uploads, ...gallery]
  const base = bases.find((b) => b.id === baseId) || null

  function removeBase(id) {
    if (uploads.some((u) => u.id === id)) setUploads((p) => p.filter((u) => u.id !== id))
    else onRemovePick?.(id)
    if (baseId === id) setBaseId('')
  }

  async function fileToDataUrl(f) {
    return new Promise((res) => {
      const r = new FileReader()
      r.onload = () => res(r.result)
      r.readAsDataURL(f)
    })
  }

  async function onUploadBase(e) {
    const files = [...(e.target.files || [])]
    for (const f of files) {
      const dataUrl = await fileToDataUrl(f)
      const id = 'up_' + Math.random().toString(36).slice(2)
      setUploads((p) => [{ id, dataUrl }, ...p])
      setBaseId((cur) => cur || id)
    }
    e.target.value = ''
  }

  async function onUploadRef(e, setter) {
    const f = (e.target.files || [])[0]
    if (!f) return
    const dataUrl = await fileToDataUrl(f)
    setter({ dataUrl, ...dataUrlToImage(dataUrl) })
    e.target.value = ''
  }

  function applyLayers(l) {
    setHeadline(l.headline || '')
    setText(l.text || '')
    // helptext = {text, style} (breakdown mới); vẫn nhận string bản cũ.
    const hp = typeof l.helptext === 'string' ? { text: l.helptext, style: '' } : (l.helptext || {})
    setHelptext(hp.text || '')
    setHelptextStyle(hp.style || '')
    setHelptextLoc(hp.location || 'auto')
  }

  // Breakdown brief → các ô (skip lớp trống). Trống brief → AI tự đề xuất từ base.
  async function analyze() {
    setError('')
    if (!base) return setError(t('content.errNeedBase'))
    setAnalyzing(true)
    try {
      const l = await breakdownAdBrief(master, dataUrlToImage(base.dataUrl))
      applyLayers(l)
      // Bóc xong thì mở các ô cho user xem/sửa. Trước đây gọi setInfoMode —
      // state cục bộ đó đã bị thay bằng prop `flow` dùng chung mà chỗ này bị
      // bỏ quên, nên Analyze chạy xong là ném ReferenceError.
      setFlow?.('manual')
    } catch (e) {
      setError(t('content.errSuggest') + e.message)
    } finally {
      setAnalyzing(false)
    }
  }

  function currentLayers() {
    return {
      headline: headline.trim(),
      text: text.trim(),
      helptext: { text: helptext.trim(), style: helptextStyle.trim(), location: helptextLoc },
    }
  }

  async function genContent() {
    setError('')
    if (!base) return setError(t('content.errNeedBase'))
    setBusy(true)
    try {
      const baseImg = dataUrlToImage(base.dataUrl)
      // Các ô đang trống hết → breakdown từ master (hoặc AI tự đề xuất) trước.
      let layers = currentLayers()
      const empty = !layers.headline && !layers.text && !layers.helptext.text
      if (empty) {
        layers = await breakdownAdBrief(master, baseImg)
        applyLayers(layers)
      }
      const refs = { overall: overallRef, helptext: helptextRef }
      const jobs = Array.from({ length: count }, (_, i) => i)
      setResults(jobs.map(() => ({ status: 'loading' })))
      await Promise.all(
        jobs.map(async (i) => {
          try {
            // Nói rõ đây là mẫu thứ mấy/mấy: mỗi lượt gọi là một request độc
            // lập, model không thấy các mẫu anh em nên phải bảo nó khác đi.
            const hint = count > 1
              ? `Variant ${i + 1} of ${count}. ${VARIATIONS[i % VARIATIONS.length]}`
              : ''
            const out = await generateAdCreative(baseImg, refs, layers, LOCK_RATIO || ratio, hint)
            const dataUrl = `data:${out.mimeType};base64,${out.base64}`
            setResults((prev) => {
              const next = [...prev]
              next[i] = { status: 'done', dataUrl }
              return next
            })
          } catch (e) {
            setResults((prev) => {
              const next = [...prev]
              next[i] = { status: 'error', error: e.message }
              return next
            })
          }
        })
      )
    } catch (e) {
      setError(t('content.errSuggest') + e.message)
    } finally {
      setBusy(false)
    }
  }

  function download(dataUrl, i) {
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `ad-${i + 1}.png`
    a.click()
  }

  // Hai phần tử anh em: cột giữa (việc) và cột phải (điều khiển) — App xếp
  // chúng vào lưới .shell cùng cột phiên.
  return (
    <>
      <section className="mid" hidden={hidden}>
        {/* Hai khu xếp CẠNH nhau, không chồng lên nhau: xếp dọc thì "Yêu cầu
            add-in" rơi khỏi tầm nhìn (đo 1500×900: vùng cuộn cao 371px, nội
            dung 590px — phải cuộn 219px mới thấy nó), mà đó lại là ô người
            dùng gõ vào mỗi lượt. Cạnh nhau thì cả hai thấy được từ đầu. */}
        <div className="mid-scroll content-cols">
          {/* 1. Mockup base — HAI khu: kho ảnh đã đẩy sang, và ảnh ĐANG CHỌN
               phóng to. Chỉ có lưới thumbnail thì biết có những ảnh nào nhưng
               không nhìn rõ mình sắp overlay chữ lên cái gì. */}
          <section className="panel">
            <div className="sec-head">
              <h2>{t('content.step1')}</h2>
              <span className="note">{bases.length ? bases.length + ' ' + t('rail.images') : t('content.step1Note')}</span>
              <span className="spread" />
              <label className="filebtn">{t('content.upload')}
                <input type="file" accept="image/*" multiple hidden onChange={onUploadBase} />
              </label>
            </div>

            <div className="base-split">
              <div className="base-list">
                {bases.length === 0 ? (
                  <p className="hint">{t('content.noBase')}</p>
                ) : (
                  <div className="content-basegrid">
                    {bases.map((b) => (
                      <button
                        key={b.id}
                        className={baseId === b.id ? 'content-basethumb sel' : 'content-basethumb'}
                        onClick={() => setBaseId(b.id)}
                        title={t('content.pickBase')}
                      >
                        <img src={b.dataUrl} alt="base" />
                        {baseId === b.id && <span className="content-check"><IcCheck size={12} /></span>}
                        <span
                          className="content-basedel"
                          title={t('content.removeBase')}
                          onClick={(e) => { e.stopPropagation(); removeBase(b.id) }}
                        >×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="base-pick">
                <span className="ob-label">{t('content.picked')}</span>
                <div className="base-pick-frame">
                  {base ? (
                    <img src={base.dataUrl} alt={t('content.picked')} onClick={() => setZoom(base.dataUrl)} title={t('ref.zoom')} />
                  ) : (
                    <span className="hint">{t('content.pickNone')}</span>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* 2. Thông tin add-in — Auto (brief) hoặc Manual (tự điền ô) */}
          <section className="panel">
            <div className="sec-head">
              <h2>{t('content.step2')}</h2>
              <span className="note">{flow === 'auto' ? t('content.infoAutoTag') : t('content.infoManualTag')}</span>
            </div>

            {flow === 'auto' ? (
              <>
                <textarea
                  className="content-master"
                  rows={3}
                  value={master}
                  onChange={(e) => setMaster(e.target.value)}
                  placeholder={t('content.masterPh')}
                />
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="ico ghost" onClick={analyze} disabled={analyzing || !base} title={t('content.analyzeBtn')} aria-label={t('content.analyzeBtn')}>
                    {analyzing ? <span className="spin" /> : <IcSparkle />}
                  </button>
                  <span className="ob-label">{t('content.analyzeBtn')}</span>
                </div>
                <p className="hint">{t('content.autoInfoHint')}</p>
              </>
            ) : (
              <div className="content-layers">
                <label className="lbl">{t('content.headline')}</label>
                <input value={headline} onChange={(e) => setHeadline(e.target.value)} placeholder={t('content.headlinePh')} />
                <label className="lbl">{t('content.text')}</label>
                <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('content.textPh')} />
                <label className="lbl">{t('content.helptext')}</label>
                <input value={helptext} onChange={(e) => setHelptext(e.target.value)} placeholder={t('content.helptextPh')} />
                <label className="lbl">{t('content.helptextStyle')}</label>
                <input value={helptextStyle} onChange={(e) => setHelptextStyle(e.target.value)} placeholder={t('content.helptextStylePh')} />
                <label className="lbl">{t('content.helptextLoc')}</label>
                <div className="content-locrow">
                  {LOCATIONS.map(([v, at]) => (
                    <button
                      key={v}
                      className={helptextLoc === v ? 'ico on' : 'ico ghost'}
                      title={v === 'auto' ? t('content.locAuto') : v}
                      aria-label={v === 'auto' ? t('content.locAuto') : v}
                      aria-pressed={helptextLoc === v}
                      onClick={() => setHelptextLoc(v)}
                    >
                      <LocIcon at={at} />
                    </button>
                  ))}
                </div>
                <p className="hint">{t('content.layersHint')}</p>
              </div>
            )}
          </section>

          {error && <div className="error">{error}</div>}

        </div>

        {/* ---- Khung kết quả: lưới, cùng kiểu với tab Mockup ---- */}
        <div className="preview-pane">
          <div className="sec-head">
            <h2>{t('content.results')}</h2>
            <span className="note">{results.length > 0 ? results.length + ' · ' + (LOCK_RATIO || ratio) : (LOCK_RATIO || ratio)}</span>
            <span className="spread" />
            <button className="ico sm ghost" disabled={results.length === 0} title={t('content.clearOutput')} aria-label={t('content.clearOutput')} onClick={() => setResults([])}><IcTrash size={13} /></button>
          </div>
          <div className="pv-body">
            {results.length === 0 ? (
              <div className="content-output-empty">{t('content.outputEmpty')}</div>
            ) : (
              <div className="grid">
                {results.map((r, i) => (
                  <div className="tile" key={i}>
                    <div className="tile-frame">
                      {r.status === 'loading' && <div className="ph"><span className="spin" />{t('content.genning')}</div>}
                      {r.status === 'error' && <div className="ph err">{t('content.errPrefix')} {r.error}</div>}
                      {r.status === 'done' && <img src={r.dataUrl} alt={'ad ' + (i + 1)} onClick={() => setZoom(r.dataUrl)} />}
                    </div>
                    <div className="tile-foot">
                      {r.status === 'done' && (
                        <div className="tile-actions2">
                          <button className="ico sm acc" title={t('content.download')} aria-label={t('content.download')} onClick={() => download(r.dataUrl, i)}><IcDownload size={13} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <aside className="cfg" hidden={hidden}>
        <div className="fold">
          <span className="ob-label">{t('flow.label')}</span>
          <div className="mode-switch flow-switch" data-flow={flow} style={{ width: '100%', marginTop: 6 }}>
            <button className={flow === 'auto' ? 'seg active' : 'seg'} title={t('flow.autoHint')} onClick={() => setFlow?.('auto')}><IcBolt size={13} /> {t('flow.auto')}</button>
            <button className={flow === 'manual' ? 'seg active' : 'seg'} title={t('flow.manualHint')} onClick={() => setFlow?.('manual')}><IcPlayFrom size={13} /> {t('flow.manual')}</button>
          </div>
        </div>

        <div className="fold">
          <div className="cta-count">
            <span className="ob-label">{t('content.count')} <b className="count num-fix">{count}</b></span>
            <input className="range" type="range" min={1} max={4} value={count} onChange={(e) => setCount(+e.target.value)} />
          </div>
          {/* Nút rộng 100% nên chữ đổi không làm nó đổi cỡ — số mẫu đã nằm ở
              nhãn phía trên, không nhét vào nút. */}
          <button className="btn primary" style={{ width: '100%', marginTop: 8 }} onClick={genContent} disabled={busy || !base}>
            {busy ? t('content.genning') : <><IcBolt /> {t('content.genBtn')}</>}
          </button>
          <p className="hint">{t('content.genHint')}</p>
        </div>

        {!LOCK_RATIO && (
          <div className="fold">
            <span className="ob-label">{t('content.ratioTitle')}</span>
            <div className="content-ratios">
              {FB_RATIOS.map(([v, lblKey, noteKey]) => (
                <button key={v} className={ratio === v ? 'content-ratio sel' : 'content-ratio'} onClick={() => setRatio(v)}>
                  <strong>{t(lblKey)}</strong>
                  <span className="hint">{t(noteKey)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="fold">
          <span className="ob-label">{t('content.refTitle')}</span>
          <div className="content-refrow">
            <div className="content-refcell">
              <div className="content-block-head">
                <span className="lbl">{t('content.refOverall')}</span>
                <label className="filebtn">{overallRef ? t('content.changeStyle') : t('content.upload')}
                  <input type="file" accept="image/*" hidden onChange={(e) => onUploadRef(e, setOverallRef)} />
                </label>
              </div>
              {overallRef ? (
                <div className="content-styleref">
                  <img src={overallRef.dataUrl} alt="overall ref" onClick={() => setZoom(overallRef.dataUrl)} />
                  <button className="ico sm ghost" title={t('content.removeStyle')} aria-label={t('content.removeStyle')} onClick={() => setOverallRef(null)}><IcClose size={13} /></button>
                </div>
              ) : (
                <p className="hint">{t('content.refOverallHint')}</p>
              )}
            </div>
            <div className="content-refcell">
              <div className="content-block-head">
                <span className="lbl">{t('content.refHelptext')}</span>
                <label className="filebtn">{helptextRef ? t('content.changeStyle') : t('content.upload')}
                  <input type="file" accept="image/*" hidden onChange={(e) => onUploadRef(e, setHelptextRef)} />
                </label>
              </div>
              {helptextRef ? (
                <div className="content-styleref">
                  <img src={helptextRef.dataUrl} alt="helptext ref" onClick={() => setZoom(helptextRef.dataUrl)} />
                  <button className="ico sm ghost" title={t('content.removeStyle')} aria-label={t('content.removeStyle')} onClick={() => setHelptextRef(null)}><IcClose size={13} /></button>
                </div>
              ) : (
                <p className="hint">{t('content.refHelptextHint')}</p>
              )}
            </div>
          </div>
        </div>

        {cfgBottom}
      </aside>

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
    </>
  )
}
