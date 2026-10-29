import { IcSparkle, IcPalette, IcSearch } from './Icons.jsx'
import { useState } from 'react'
import JSZip from 'jszip'
import ProgressBar from './ProgressBar.jsx'
import Lightbox from './Lightbox.jsx'
import { cropBox } from './shared.js'
import {
  REDESIGN_DIRECTIONS,
  extractDesignFromMockup,
  extractElementsGemini,
  redesignImage,
} from './providers/gemini.js'
import { extractElementsGpt } from './providers/openai.js'

// Redesign line (green branch of the whiteboard):
// mockup → design tách từ mockup → elements tách từ design →
// user chọn phần cần redesign (hoặc toàn bộ) → 3 option design làm mới.
export default function RedesignTab({ refImage, setRefImage, goMockupTab }) {
  const [design, setDesign] = useState(null) // {mimeType, base64, dataUrl}
  const [elements, setElements] = useState([]) // {name, description, box_2d, thumb, selected}
  const [provider, setProvider] = useState('gemini') // element extraction: 'gemini' | 'gpt'
  const [wholeDesign, setWholeDesign] = useState(false)
  const [directions, setDirections] = useState([...REDESIGN_DIRECTIONS])
  const [options, setOptions] = useState([]) // {status, dataUrl, error}

  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(null)

  const selected = elements.filter((e) => e.selected)
  const canRedesign = design && (wholeDesign || selected.length > 0)

  async function doExtractDesign() {
    setError('')
    if (!refImage) return setError('Cần ảnh mockup trước — lấy từ link hoặc upload ở khung trên.')
    setBusy('design')
    try {
      const img = await extractDesignFromMockup(refImage)
      setDesign({ ...img, dataUrl: `data:${img.mimeType};base64,${img.base64}` })
      setElements([])
      setOptions([])
    } catch (e) {
      setError('Tách design: ' + e.message)
    } finally {
      setBusy('')
    }
  }

  // Escape hatch: the source image already IS a flat design (user uploaded the
  // artwork itself) — skip the AI extraction step and use it directly.
  function useRefAsDesign() {
    setError('')
    if (!refImage) return setError('Chưa có ảnh — lấy từ link hoặc upload ở khung trên.')
    setDesign(refImage)
    setElements([])
    setOptions([])
  }

  async function doExtractElements() {
    setError('')
    if (!design) return setError('Tách design trước đã.')
    setBusy('elements')
    try {
      const els = provider === 'gpt'
        ? await extractElementsGpt(design)
        : await extractElementsGemini(design)
      if (!els.length) throw new Error('Model không nhận diện được element nào — thử provider còn lại.')
      // Crop thumbnails client-side from the bounding boxes (free, no API call).
      const withThumbs = await Promise.all(
        els.map(async (e) => {
          let thumb = null
          if (e.box_2d) {
            try { thumb = await cropBox(design.dataUrl, e.box_2d) } catch (_) { /* no thumb */ }
          }
          return { ...e, thumb, selected: false }
        })
      )
      setElements(withThumbs)
    } catch (e) {
      setError('Tách element: ' + e.message)
    } finally {
      setBusy('')
    }
  }

  function toggleElement(i) {
    setElements((prev) => prev.map((e, j) => (j === i ? { ...e, selected: !e.selected } : e)))
  }

  async function genOption(i, dirs) {
    const direction = (dirs ?? directions)[i] || REDESIGN_DIRECTIONS[i % REDESIGN_DIRECTIONS.length]
    setOptions((prev) => {
      const next = [...prev]
      next[i] = { status: 'loading' }
      return next
    })
    try {
      const img = await redesignImage(design, selected, direction, wholeDesign, '')
      setOptions((prev) => {
        const next = [...prev]
        next[i] = { status: 'done', dataUrl: `data:${img.mimeType};base64,${img.base64}` }
        return next
      })
    } catch (e) {
      setOptions((prev) => {
        const next = [...prev]
        next[i] = { status: 'error', error: e.message }
        return next
      })
    }
  }

  async function generateOptions() {
    setError('')
    if (!canRedesign) return setError('Chọn ít nhất 1 element, hoặc bật "Redesign toàn bộ".')
    setBusy('options')
    setOptions(Array.from({ length: 3 }, () => ({ status: 'loading' })))
    await Promise.all([0, 1, 2].map((i) => genOption(i)))
    setBusy('')
  }

  function downloadOption(i) {
    const o = options[i]
    if (!o?.dataUrl) return
    const a = document.createElement('a')
    a.href = o.dataUrl
    a.download = `redesign-option-${i + 1}.png`
    a.click()
  }

  async function downloadZip() {
    const zip = new JSZip()
    if (design?.dataUrl) zip.file('design-original.png', design.dataUrl.split(',')[1], { base64: true })
    options.forEach((o, i) => {
      if (o?.dataUrl) zip.file(`redesign-option-${i + 1}.png`, o.dataUrl.split(',')[1], { base64: true })
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'redesign-options.zip'
    a.click()
  }

  // Pipe a redesigned option back into the gold branch: it becomes the
  // reference image for generating context mockups.
  function sendToMockup(i) {
    const o = options[i]
    if (!o?.dataUrl) return
    setRefImage({ mimeType: 'image/png', base64: o.dataUrl.split(',')[1], dataUrl: o.dataUrl })
    goMockupTab()
  }

  const doneCount = options.filter((o) => o?.status === 'done').length
  const anyBusy = busy !== ''

  const progress = !anyBusy
    ? null
    : busy === 'design'
      ? { label: 'Tách design từ mockup…', percent: null }
      : busy === 'elements'
        ? { label: `Tách element (${provider === 'gpt' ? 'GPT' : 'Gemini'})…`, percent: null }
        : { label: `Tạo option redesign ${doneCount}/3`, percent: (doneCount / 3) * 100 }

  return (
    <div className="layout">
      {/* ============ LEFT — pipeline steps ============ */}
      <aside className="sidebar">
        <section className="panel green">
          <div className="phead"><span className="idx green">1</span><h2>Tách design từ mockup</h2></div>
          <button className="btn primary" disabled={anyBusy} onClick={doExtractDesign}>
            {busy === 'design' ? 'Đang tách…' : ' Tách design (AI)'}
          </button>
          <button className="btn" disabled={anyBusy} onClick={useRefAsDesign}>
            Ảnh gốc đã là design phẳng → dùng luôn
          </button>
          {design && <img className="thumb" src={design.dataUrl} alt="design" />}
          <p className="hint">Kéo artwork phẳng ra khỏi ảnh mockup (bỏ phối cảnh, chất liệu, background).</p>
        </section>

        <section className="panel green">
          <div className="phead"><span className="idx green">2</span><h2>Tách element</h2></div>
          <label className="lbl">Model phân tích</label>
          <div className="row">
            <button className={provider === 'gemini' ? 'chip active' : 'chip'} onClick={() => setProvider('gemini')}>
              Gemini
            </button>
            <button className={provider === 'gpt' ? 'chip active' : 'chip'} onClick={() => setProvider('gpt')}>
              GPT (OpenAI)
            </button>
          </div>
          <button className="btn" disabled={anyBusy || !design} onClick={doExtractElements}>
            {busy === 'elements' ? 'Đang phân tích…' : ' Tách element từ design'}
          </button>
          <p className="hint">Vision model liệt kê các thành phần rời của design (hình chính, text, khung, hoạ tiết…).</p>
        </section>

        <section className="panel green">
          <div className="phead"><span className="idx green">3</span><h2>Chọn phần redesign</h2></div>
          <label className="checkline">
            <input type="checkbox" checked={wholeDesign} onChange={(e) => setWholeDesign(e.target.checked)} />
            <span>Redesign TOÀN BỘ design</span>
          </label>
          {!wholeDesign && (
            elements.length === 0 ? (
              <p className="hint">Chưa có element — chạy bước 2, hoặc tick "toàn bộ".</p>
            ) : (
              <div className="element-list">
                {elements.map((el, i) => (
                  <label className={el.selected ? 'element-row selected' : 'element-row'} key={i}>
                    <input type="checkbox" checked={el.selected} onChange={() => toggleElement(i)} />
                    {el.thumb && <img className="element-thumb" src={el.thumb} alt={el.name} />}
                    <span className="element-text">
                      <b>{el.name}</b>
                      <small>{el.description}</small>
                    </span>
                  </label>
                ))}
              </div>
            )
          )}
        </section>

        <section className="panel green">
          <div className="phead"><span className="idx green">4</span><h2>3 hướng redesign</h2><span className="note">sửa tay được</span></div>
          {directions.map((d, i) => (
            <div className="scene-row" key={i}>
              <span className="scene-idx">{i + 1}</span>
              <input
                value={d}
                onChange={(e) => setDirections((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
              />
            </div>
          ))}
          <button className="btn primary" disabled={anyBusy || !canRedesign} onClick={generateOptions}>
            {busy === 'options' ? `Đang tạo… ${doneCount}/3` : ' Tạo 3 option redesign'}
          </button>
        </section>

        {error && <div className="error">{error}</div>}
      </aside>

      {/* ============ RIGHT — options output ============ */}
      <main className="stage">
        <div className="stage-head">
          <div className="phead"><span className="idx green">5</span><h2>Option design được làm mới</h2></div>
          {doneCount > 0 && (
            <button className="btn" onClick={downloadZip}>Tải tất cả · ZIP ({doneCount + (design ? 1 : 0)})</button>
          )}
        </div>

        <div className="meta">
          <span>Design gốc <b>{design ? 'đã tách' : '—'}</b></span>
          <span>Element <b>{elements.length ? `${selected.length}/${elements.length} chọn` : '—'}</b></span>
          <span>Phạm vi <b>{wholeDesign ? 'toàn bộ' : selected.length ? 'phần chọn' : '—'}</b></span>
        </div>

        {options.length === 0 ? (
          <div className="empty">
            {design ? (
              <img className="empty-ref" src={design.dataUrl} alt="design preview" />
            ) : (
              <div className="empty-frame">◆</div>
            )}
            <p className="empty-text">
              Chưa có option. Chạy các bước 1→4 ở cột trái — 3 option redesign hiện ở đây.
            </p>
          </div>
        ) : (
          <div className="grid">
            {options.map((o, i) => (
              <div className="tile" key={i}>
                <div className="tile-frame" style={{ aspectRatio: '1 / 1' }}>
                  {o?.status === 'loading' && <div className="ph"><span className="spin" />Đang tạo…</div>}
                  {o?.status === 'error' && <div className="ph err">{o.error}</div>}
                  {o?.status === 'done' && <img src={o.dataUrl} alt={`option ${i + 1}`} onClick={() => setZoom(o.dataUrl)} />}
                </div>
                <div className="tile-foot">
                  <span className="tile-scene" title={directions[i]}>Option {i + 1} · {directions[i]}</span>
                  {o?.status === 'done' && (
                    <div className="tile-actions">
                      <button className="ghost" onClick={() => downloadOption(i)}>Tải</button>
                      <button className="ghost" onClick={() => genOption(i)}>Tạo lại</button>
                      <button className="ghost" onClick={() => sendToMockup(i)}>→ Tạo mockup</button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      {progress && <ProgressBar label={progress.label} percent={progress.percent} />}
    </div>
  )
}
