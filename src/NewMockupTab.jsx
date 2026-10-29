import StepList from './StepList.jsx'
import { IcSliders, IcFilm, IcBolt, IcPlayFrom, IcRefresh, IcDownload, IcStar, IcCheck, IcImage, IcCamera, IcDiamond, IcArrowUp, IcLink, IcText, IcFacebook, IcDots, IcTrash, IcSparkle, IcShrink, IcGrow, IcClose, IcChevron } from './Icons.jsx'
import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { saveSession, getSession, newSessionId } from './sessions.js'
import JSZip from 'jszip'
import ProgressBar from './ProgressBar.jsx'
import Lightbox from './Lightbox.jsx'
import AngleThumb from './AngleThumb.jsx'
import { t, getLang } from './i18n.js'
import { beginRun, endRun, abortRun, isCancelled } from './api.js'
import { ratioForOrientation, nearestAspect, fetchProductImage, composeScaleCanvas, shotFractionFor, parseShotTag, CAMERA_ANGLES, DEFAULT_ANGLE_KEYS, planAngles, REQUIRED_SCENES, REQUIRED_COUNT, LOCK_RATIO } from './shared.js'
import {
  SCENE_VARIATIONS,
  extractInfoFromUrl,
  extractInfoFromImage,
  extractInfoFromText,
  generateBasePrompt,
  generateSizeComparison,
  suggestScenes,
  generateImage,
  verifyScale,
  editResultImage,
} from './providers/gemini.js'

const RATIOS = ['1:1', '4:5', '3:2', '16:9']
const EMPTY_BRIEF = { dimensions: '', material: '', production: '', orientation: '', placement: '' }

// New mockup line (gold branch of the whiteboard):
// URL → {mockup gốc, chủ đề thiết kế, target audience, product brief}
//     → mockup bối cảnh mới (+ optional user info) → N mockup bổ sung.
// `bars` = thanh tab do App dựng, `cfgTop`/`cfgBottom` = ảnh tham chiếu và
// model — cũng của App. Nhận vào dưới dạng JSX để App xếp được đủ ba cột mà
// state của tab này KHÔNG phải nâng lên trên.
export default function NewMockupTab({
  flow = 'auto', setFlow,
  url, source = 'link', pasteText = '',
  setUrl, setSource, setPasteText,
  refImage, extraRefs = [], setRefImage, useAsRef, refSlotsFull, sendToContent,
  bars, refSlot, cfgBottom, hidden, sentUrls,
  openSession, onSessionSaved, resetReq,
}) {
  const isText = source === 'text'
  // Nạp info theo nguồn: text (dán) → breakdown; else link → cào URL;
  // else ảnh upload → đọc từ ảnh. Downstream (scenes/prompt/gen) không đổi.
  const extractInfo = () =>
    isText ? extractInfoFromText(pasteText) : url ? extractInfoFromUrl(url) : extractInfoFromImage(refImage)
  // Đã có đủ đầu vào để chạy chưa?
  const hasInput = isText ? Boolean(pasteText.trim()) : Boolean(url || refImage)
  const needInputMsg = isText ? t('mockup.errNeedPaste') : t('mockup.errNeedInput')
  const lang = getLang()
  const angleLabel = (a) => (lang === 'en' ? a.labelEn : a.label)
  const reqLabel = (r) => (lang === 'en' ? r.labelEn : r.label)
  const [content, setContent] = useState({ name: '', category: '', features: [], description: '', designTheme: '' })
  const [basePrompt, setBasePrompt] = useState('')

  const [ratioMode, setRatioMode] = useState('1:1')
  const [customW, setCustomW] = useState(1000)
  const [customH, setCustomH] = useState(1000)
  const [count, setCount] = useState(4)

  const [niche, setNiche] = useState('')
  // Bộ góc camera user chọn TRƯỚC khi auto-gen; pipeline phân bổ đều cho N ảnh.
  // Mặc định = bộ đa dạng (function + design). Bỏ hết = để AI tự mix (như cũ).
  const [angleKeys, setAngleKeys] = useState(() => new Set(DEFAULT_ANGLE_KEYS))
  // Số lượng sản phẩm mỗi ảnh: false = 1 sản phẩm/ảnh (mặc định, full scale QA);
  // true = bám ĐÚNG số lượng có trong ref (ref 3 đĩa → 3, ref 1 → 1).
  const [matchRef, setMatchRef] = useState(false)
  // Chế độ gen: 'free' = tự do (count + góc camera + shot type); 'combo' =
  // Lifestyle Combo (4 cảnh chuẩn team, ẩn hết tinh chỉnh camera/shot).
  const [mode, setMode] = useState('free')
  const [scenes, setScenes] = useState([])
  const [brief, setBrief] = useState(EMPTY_BRIEF)
  // Ô Info bổ sung là TUỲ CHỌN: tick = bỏ qua (dùng giá trị auto), untick = tự nhập.
  const [skipInfo, setSkipInfo] = useState(true)
  // Quy đổi kích thước → câu so sánh vật quen thuộc + vật neo scale trong scene.
  const [sizeCmp, setSizeCmp] = useState({ comparison: '', anchors: [], sizeClass: '', relation: '' })
  const [prominence, setProminence] = useState('medium')
  const [autoStep, setAutoStep] = useState('')

  const [images, setImages] = useState([]) // {status, dataUrl, error, scene, note}
  const [reoptIdx, setReoptIdx] = useState(-1) // dòng phối cảnh đang re-optimize
  const [busy, setBusy] = useState('')
  const [cancelled, setCancelled] = useState(false) // vừa bấm Huỷ — báo nhẹ, không phải lỗi
  const [error, setError] = useState('')
  const [zoom, setZoom] = useState(null) // dataUrl đang phóng to
  // Redesign UI: gom control nâng cao vào 1 chỗ mở khi cần; scene tuner mở theo
  // yêu cầu; menu ⋯ trên tile gom các thao tác phụ.
  const [showAdv, setShowAdv] = useState(false)
  const [openStep, setOpenStep] = useState('')
  const [showScenes, setShowScenes] = useState(false)
  // Menu ⋯ neo theo TOẠ ĐỘ nút, không nằm trong ô ảnh.
  // .tile có overflow:hidden nên menu đặt absolute bên trong bị cắt cụt —
  // đúng thứ bro thấy. position:fixed không bị tổ tiên overflow cắt.
  const [menu, setMenu] = useState(null) // {i, x, y}
  // Auto thì gập hết cho gọn, Manual mới bung ra. Đổi chế độ là đặt lại mặc
  // định, nhưng người dùng vẫn tự gập/mở được sau đó.
  const [openPanels, setOpenPanels] = useState({ content: flow === 'manual', scenes: flow === 'manual' })
  useEffect(() => {
    setOpenPanels({ content: flow === 'manual', scenes: flow === 'manual' })
  }, [flow])

  // Ghì menu vào trong khung nhìn. Neo theo nút thì ô ở mép trên/mép phải sẽ
  // đẩy menu thò ra ngoài màn — đo xong rồi nhích lại, chứ đoán trước chiều cao
  // menu là sai ngay khi thêm/bớt một mục.
  const menuRef = useRef(null)
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el || !menu) return
    el.style.transform = ''
    const r = el.getBoundingClientRect()
    const pad = 8
    let dx = 0
    let dy = 0
    if (r.left < pad) dx = pad - r.left
    else if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right
    if (r.top < pad) dy = pad - r.top
    else if (r.bottom > window.innerHeight - pad) dy = window.innerHeight - pad - r.bottom
    if (dx || dy) el.style.transform = `translate(${dx}px, ${dy}px)`
  }, [menu])

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null) }
    window.addEventListener('click', close)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', close)
    }
  }, [menu])

  const resolvedRatio = LOCK_RATIO || (ratioMode === 'custom' ? nearestAspect(customW, customH) : ratioMode)
  const doneCount = images.filter((i) => i?.status === 'done').length

  // Ảnh đã về của LƯỢT ĐANG CHẠY. Phải dùng ref chứ không đọc state `images`:
  // pipeline chạy vài chục giây, closure của autoAll giữ giá trị state từ lúc
  // bắt đầu nên đọc ra là rỗng.
  const doneRef = useRef([])

  // Lưu phiên sau khi chạy xong. Nhận giá trị CỤC BỘ của pipeline thay vì đọc
  // state, cùng lý do trên.
  async function persistSession(info) {
    const imgs = doneRef.current.filter(Boolean)
    if (!imgs.length) return
    const rec = {
      id: newSessionId(),
      at: Date.now(),
      name: info.name || url || t('rail.current'),
      url: url || '', source, pasteText,
      content: info.content, brief: info.brief, niche: info.niche,
      scenes: info.scenes, basePrompt: info.prompt, sizeCmp,
      mode: info.mode, count: info.count,
      angleKeys: [...angleKeys], matchRef, prominence, skipInfo,
      images: imgs,
    }
    onSessionSaved?.(await saveSession(rec))
  }

  // "Phiên mới": xoá sạch trạng thái của tab, kể cả output. App chỉ bắn một
  // nonce xuống vì state của tab nằm ở đây, App không với tới được.
  useEffect(() => {
    if (!resetReq) return
    setContent({ name: '', category: '', features: [], description: '', designTheme: '' })
    setBrief(EMPTY_BRIEF)
    setNiche('')
    setScenes([])
    setBasePrompt('')
    setSizeCmp({ comparison: '', anchors: [], sizeClass: '', relation: '' })
    setImages([])
    doneRef.current = []
    setError('')
    setCancelled(false)
    setMenu(null)
  }, [resetReq])

  // Mở lại một phiên cũ: dựng lại đủ trạng thái, kể cả link/nguồn vốn nằm ở App.
  useEffect(() => {
    if (!openSession) return
    let alive = true
    getSession(openSession.id).then((s) => {
      if (!alive || !s) return
      setUrl?.(s.url || '')
      setSource?.(s.source || 'link')
      setPasteText?.(s.pasteText || '')
      setContent(s.content || { name: '', category: '', features: [], description: '', designTheme: '' })
      setBrief(s.brief || EMPTY_BRIEF)
      setNiche(s.niche || '')
      setScenes(s.scenes || [])
      setBasePrompt(s.basePrompt || '')
      setSizeCmp(s.sizeCmp || { comparison: '', anchors: [], sizeClass: '', relation: '' })
      setMode(s.mode || 'free')
      setCount(s.count || 4)
      setAngleKeys(new Set(s.angleKeys || DEFAULT_ANGLE_KEYS))
      setMatchRef(Boolean(s.matchRef))
      setProminence(s.prominence || 'medium')
      setSkipInfo(s.skipInfo !== false)
      setImages((s.images || []).map((dataUrl, i) => ({
        status: 'done', dataUrl, scene: (s.scenes || [])[i] || '',
      })))
      doneRef.current = [...(s.images || [])]
      setError('')
      setCancelled(false)
    })
    return () => { alive = false }
  }, [openSession])

  function applyInfo(info) {
    setContent({
      name: info.name || '',
      category: info.category || '',
      features: Array.isArray(info.features) ? info.features : [],
      description: info.description || '',
      designTheme: info.designTheme || '',
    })
    setBrief({
      dimensions: info.dimensions || '',
      material: info.material || '',
      production: info.production || '',
      orientation: info.orientation || '',
      placement: info.placement || '',
    })
    if (info.niche) setNiche(info.niche)
    const r = ratioForOrientation(info.orientation)
    if (r) setRatioMode(r)
  }

  function sceneFor(i) {
    const s = scenes[i]
    return s && s.trim() ? s.trim() : SCENE_VARIATIONS[i % SCENE_VARIATIONS.length]
  }

  function setSceneAt(i, val) {
    setScenes((prev) => {
      const next = [...prev]
      next[i] = val
      return next
    })
  }

  // Đổi shot type của 1 dòng phối cảnh → ghi lại tag [shot] trong scene (prompt
  // đổi theo), giữ nguyên phần bối cảnh. Ô trống thì đặt tag rỗng để user gõ/tối ưu.
  const SHOTS = ['close-up', 'medium', 'wide', 'human']
  const shotOf = (i) => parseShotTag(scenes[i] || '').shot
  function setShotAt(i, shot) {
    const { text } = parseShotTag(scenes[i] || '')
    setSceneAt(i, text ? `[${shot}] ${text}` : `[${shot}] `)
  }
  // Re-suggest riêng 1 dòng qua AI, giữ shot đã chọn (nếu có).
  async function reoptimizeScene(i) {
    if (!content.name && !content.category) return setError(t('mockup.errNeedContent'))
    setError('')
    setReoptIdx(i)
    try {
      const keepShot = shotOf(i)
      const s = await suggestScenes(content, niche, 1, brief, sizeCmp, isText)
      const one = (s[0] || '').trim()
      if (one) {
        const { text } = parseShotTag(one)
        setSceneAt(i, keepShot ? `[${keepShot}] ${text}` : one)
      }
    } catch (e) {
      setError(t('mockup.errScenes') + e.message)
    } finally {
      setReoptIdx(-1)
    }
  }

  // Đổi mode → clear output: Tùy biến & Lifestyle Combo KHÔNG dùng chung lưới ảnh.
  function switchMode(m) {
    if (m === mode) return
    setMode(m)
    setError('')
    // KHÔNG xoá ảnh đã gen. Ảnh là kết quả đã tốn tiền gọi API; đổi kiểu mockup
    // chỉ là đổi cách chạy LƯỢT SAU, không phải lý do vứt lượt trước.
    // (Trước đây gọi setImages([]) ở đây nên đổi Combo↔Custom là mất trắng
    //  output, phải bấm lại vào phiên mới thấy ảnh cũ.)
  }

  function toggleAngle(key) {
    setAngleKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  // Kế hoạch góc cho lượt gen hiện tại (null = không khoá góc → AI tự mix).
  const anglePlanNow = () => planAngles([...angleKeys], count)

  async function genOne(i, prompt, sceneOverride, ratioOverride, briefOverride, refOverride, cmpOverride, comboFlag = false) {
    const scene = sceneOverride ?? sceneFor(i)
    const ratio = ratioOverride ?? resolvedRatio
    const br = briefOverride ?? brief
    const ref = refOverride ?? refImage
    const cmp = cmpOverride ?? sizeCmp
    setImages((prev) => {
      const next = [...prev]
      next[i] = { status: 'loading', scene, combo: comboFlag }
      return next
    })
    try {
      // Match-ref (bám số lượng ref): size-guide + QA scale giả định 1 sản phẩm
      // nên bỏ qua khi bật, tránh xung đột khi ref có nhiều đơn vị.
      const mref = matchRef
      // Size-guide canvas: fraction theo SHOT TYPE của scene này (close-up
      // được to, wide phải nhỏ) × size class; fail thì fallback 1 ảnh.
      let layout = null
      const { shot } = parseShotTag(scene)
      const fraction = shotFractionFor(cmp?.sizeClass, shot, prominence)
      if (!mref && ref?.dataUrl && fraction) {
        try { layout = await composeScaleCanvas(ref, ratio, fraction) } catch (_) { /* optional */ }
      }
      let img = await generateImage(prompt, scene, ratio, ref, br, prominence, cmp, layout, undefined, extraRefs, mref)
      // QA tự động: vision judge chấm scale; sai → regen 1 lần kèm chỉ dẫn
      // sửa cụ thể của judge. Judge fail thì giữ ảnh gốc, không chặn flow.
      // Match-ref bỏ qua QA (tỉ lệ 1-sản-phẩm không áp được khi có nhiều đơn vị).
      if (!mref && (cmp?.comparison || br?.dimensions)) {
        try {
          const v = await verifyScale(img, br, cmp, shot)
          if (!v.ok) {
            setImages((prev) => {
              const next = [...prev]
              next[i] = { status: 'loading', scene, note: t('mockup.noteFixing'), combo: comboFlag }
              return next
            })
            img = await generateImage(prompt, scene, ratio, ref, br, prominence, cmp, layout, v.fix, extraRefs, false)
          }
        } catch (_) { /* QA optional */ }
      }
      const dataUrl = `data:${img.mimeType};base64,${img.base64}`
      setImages((prev) => {
        const next = [...prev]
        next[i] = { status: 'done', dataUrl, scene, combo: comboFlag }
        return next
      })
      doneRef.current[i] = dataUrl
    } catch (e) {
      // Bị huỷ thì cancelRun() đã dọn lưới rồi — đừng lật ô thành "lỗi đỏ".
      if (isCancelled(e)) return
      setImages((prev) => {
        const next = [...prev]
        next[i] = { status: 'error', error: e.message, scene }
        return next
      })
    }
  }

  // ===========================================================================
  // MỘT pipeline, bốn chặng — thay cho 5 hàm chạy rời trước đây.
  //
  //   0 Thông tin sản phẩm · 1 Phối cảnh · 2 Prompt gốc · 3 Sinh ảnh
  //
  // `from`  = bắt đầu từ chặng nào; `only` = chỉ chạy đúng chặng đó rồi dừng.
  // Nhờ vậy nút "chạy tiếp từ bước này" và "chỉ chạy bước này" dùng chung một
  // đường code, không phải hai nhánh logic dễ lệch nhau.
  //
  // Dùng biến CỤC BỘ chứ không đọc state giữa chừng: setState của React là bất
  // đồng bộ, closure của hàm này giữ giá trị từ lúc bắt đầu nên chặng sau đọc
  // state ra sẽ là giá trị cũ.
  // ===========================================================================
  const STAGE_BUSY = ['content', 'scenes', 'prompt', 'images']

  async function runPipeline(from = 0, { combo: comboArg, only = false } = {}) {
    setError('')
    const combo = comboArg !== undefined ? comboArg : mode === 'combo'
    if (from === 0 && !hasInput) return setError(needInputMsg)
    if (from >= 2 && only && from === 3 && !basePrompt) return setError(t('mockup.errNoPrompt'))
    if (from >= 1 && !content.name && !content.category && from !== 3) return setError(t('mockup.errNeedContent'))

    setBusy(only ? STAGE_BUSY[from] : combo ? 'combo' : 'auto')
    setCancelled(false)
    beginRun()

    const n = combo ? REQUIRED_COUNT : count
    const plan = combo ? REQUIRED_SCENES : planAngles([...angleKeys], count)
    if (combo && count !== REQUIRED_COUNT) setCount(REQUIRED_COUNT)

    // Hạt giống cho các chặng KHÔNG chạy lần này: lấy từ state hiện tại.
    let c = content
    let b = brief
    let nch = niche
    let cmp = sizeCmp
    let localRef = refImage
    let ratio = LOCK_RATIO || resolvedRatio
    let sc = Array.from({ length: n }, (_, i) => scenes[i] || '')
    let p = basePrompt

    try {
      /* ---- chặng 0: đọc sản phẩm ---- */
      if (from <= 0) {
        setAutoStep('read')
        const info = await extractInfo()
        c = {
          name: info.name || '',
          category: info.category || '',
          features: Array.isArray(info.features) ? info.features : [],
          description: info.description || '',
          designTheme: info.designTheme || '',
        }
        if (!c.name && !c.category)
          throw new Error(isText ? t('mockup.errNoParseText') : t('mockup.errNoParseSource'))
        const autoBrief = {
          dimensions: info.dimensions || '',
          material: info.material || '',
          production: info.production || '',
          orientation: info.orientation || '',
          placement: info.placement || '',
        }
        // User đã nhập tay (bỏ tick Skip) thì giá trị tay đè lên giá trị auto.
        b = skipInfo
          ? autoBrief
          : {
              dimensions: brief.dimensions || autoBrief.dimensions,
              material: brief.material || autoBrief.material,
              production: brief.production || autoBrief.production,
              orientation: brief.orientation || autoBrief.orientation,
              placement: brief.placement || autoBrief.placement,
            }
        nch = info.niche || niche
        const suggestedRatio = ratioForOrientation(b.orientation)
        ratio = LOCK_RATIO || suggestedRatio || resolvedRatio
        setContent(c)
        setBrief(b)
        if (info.niche) setNiche(info.niche)
        if (suggestedRatio) setRatioMode(suggestedRatio)

        // Kích thước số → câu so sánh + vật neo. Hỏng thì bỏ qua, không chặn.
        if (b.dimensions && !sizeCmp.comparison) {
          setAutoStep('sizecmp')
          try {
            cmp = await generateSizeComparison(c, b)
            setSizeCmp(cmp)
          } catch (_) { /* chặng phụ */ }
        }
        // Ảnh sản phẩm thật từ link làm reference. Nguồn text không có og:image.
        if (!isText && url && info.imageUrl && !refImage) {
          setAutoStep('getimg')
          try { localRef = await fetchProductImage(info.imageUrl); setRefImage(localRef) } catch (_) { /* proxy hỏng */ }
        }
        if (only) return
      }

      /* ---- chặng 1: phối cảnh ---- */
      if (from <= 1) {
        setAutoStep('scenes')
        const s = await suggestScenes(c, nch, n, b, cmp, isText, plan)
        sc = Array.from({ length: n }, (_, i) => (s[i] || '').trim() || SCENE_VARIATIONS[i % SCENE_VARIATIONS.length])
        setScenes(sc)
        if (only) return
      }

      /* ---- chặng 2: prompt gốc ---- */
      if (from <= 2) {
        setAutoStep('prompt')
        p = await generateBasePrompt(c, b)
        setBasePrompt(p)
        if (only) return
      }

      /* ---- chặng 3: sinh ảnh ---- */
      if (!p) throw new Error(t('mockup.errNoPrompt'))
      sc = Array.from({ length: n }, (_, i) => (sc[i] || '').trim() || SCENE_VARIATIONS[i % SCENE_VARIATIONS.length])
      setAutoStep('genimg')
      doneRef.current = []
      setImages(Array.from({ length: n }, (_, i) => ({ status: 'loading', scene: sc[i], combo })))
      await Promise.all(Array.from({ length: n }, (_, i) => genOne(i, p, sc[i], ratio, b, localRef, cmp, combo)))
      await persistSession({
        name: c.name, content: c, brief: b, niche: nch,
        scenes: sc, prompt: p, mode: combo ? 'combo' : 'free', count: n,
      })
    } catch (e) {
      // Huỷ không phải lỗi — đừng dội chuỗi đỏ vào mặt người dùng.
      if (!isCancelled(e)) setError(t('mockup.errAuto') + e.message)
    } finally {
      endRun()
      setBusy('')
      setAutoStep('')
    }
  }

  // Vỏ mỏng cho các chỗ gọi sẵn có.
  const autoAll = (opts) => runPipeline(0, opts)
  const autoGenContent = () => runPipeline(0, { only: true })
  const autoGenScenes = () => runPipeline(1, { only: true })
  const autoGenPrompt = () => runPipeline(2, { only: true })
  const generateAll = () => runPipeline(3, { only: true })

  // Huỷ = abort cả chùm request của lượt chạy. Ảnh nào chưa về thì bỏ khỏi
  // lưới thay vì để đứng quay mãi; ảnh đã về giữ nguyên, không phí.
  function cancelRun() {
    abortRun()
    setCancelled(true)
    setImages((prev) => prev.filter((im) => im?.status === 'done'))
    setBusy('')
    setAutoStep('')
  }


  // Per-tile edits on the CURRENT result: change background / shrink /
  // enlarge the product. Edit-in-place keeps the product rendering consistent;
  // on failure the old image is restored.
  const EDIT_ACTIONS = {
    bg: {
      noteKey: 'mockup.noteBg',
      instruction:
        'Keep the product COMPLETELY unchanged — identical design, size, angle and position in frame. ' +
        'Replace the entire background/environment with a DIFFERENT photorealistic scene that still fits ' +
        'this product and its audience: clearly different location type and lighting mood from the current one. ' +
        'Re-blend contact shadows naturally. Photorealistic product mockup.',
    },
    down: {
      noteKey: 'mockup.noteDown',
      instruction:
        'Keep the same scene, background and camera. Make the PRODUCT SMALLER — about 70% of its current ' +
        'size in this image — keeping it anchored to the same support (hand, branch, surface, wall). ' +
        'Naturally extend the surrounding background to fill the freed space. ' +
        'Do not change the product design or anything else in the scene.',
    },
    up: {
      noteKey: 'mockup.noteUp',
      instruction:
        'Keep the same scene, background and camera. Make the PRODUCT BIGGER — about 135% of its current ' +
        'size in this image — keeping it anchored to the same support (hand, branch, surface, wall) and ' +
        'fully inside the frame. Do not change the product design or anything else in the scene.',
    },
  }

  async function editTile(i, kind) {
    const cur = images[i]
    if (cur?.status !== 'done' || !cur.dataUrl) return
    setError('')
    const m = cur.dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!m) return
    const src = { mimeType: m[1] || 'image/png', base64: m[2] }
    const prev = cur
    setImages((p) => {
      const next = [...p]
      next[i] = { status: 'loading', scene: cur.scene, note: t(EDIT_ACTIONS[kind].noteKey) }
      return next
    })
    try {
      const img = await editResultImage(src, EDIT_ACTIONS[kind].instruction, resolvedRatio)
      setImages((p) => {
        const next = [...p]
        next[i] = { status: 'done', dataUrl: `data:${img.mimeType};base64,${img.base64}`, scene: cur.scene }
        return next
      })
    } catch (e) {
      setImages((p) => {
        const next = [...p]
        next[i] = prev
        return next
      })
      setError(`${t(EDIT_ACTIONS[kind].noteKey).replace('…', '')} ${t('mockup.errSuffix')} ${e.message}`)
    }
  }

  // Chốt 1 kết quả làm ẢNH CHUẨN: đẩy nó lên ô ảnh tham chiếu — mọi lượt gen
  // sau sẽ reproduce sản phẩm từ bản render đã đúng size/góc này thay vì ảnh
  // gốc từ link.
  // MỘT hành động duy nhất cho ảnh tham chiếu: nhét vào ô TRỐNG đầu tiên.
  // Trước đây tách "đặt làm ảnh chuẩn" (khoá vào ô 0) và "đưa vào ô Sub Ref"
  // (ô trống đầu tiên) — từ khi bỏ khái niệm chính/phụ thì hai cái đó làm cùng
  // một việc, để hai mục chỉ khiến người dùng phải chọn giữa hai thứ giống nhau.
  function toRef(i) {
    const cur = images[i]
    if (cur?.status !== 'done' || !cur.dataUrl) return
    const m = cur.dataUrl.match(/^data:(.*?);base64,(.*)$/)
    if (!m) return
    useAsRef?.({ mimeType: m[1] || 'image/png', base64: m[2], dataUrl: cur.dataUrl })
  }

  function downloadOne(i) {
    const img = images[i]
    if (!img?.dataUrl) return
    const a = document.createElement('a')
    a.href = img.dataUrl
    a.download = `mockup-${i + 1}.png`
    a.click()
  }

  async function downloadZip() {
    const zip = new JSZip()
    images.forEach((img, i) => {
      if (img?.dataUrl) {
        const base64 = img.dataUrl.split(',')[1]
        zip.file(`mockup-${i + 1}.png`, base64, { base64: true })
      }
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'mockups.zip'
    a.click()
  }

  const anyBusy = busy !== ''

  // Map mọi trạng thái busy → {label, percent} cho progress bar dưới màn hình.
  // percent = null → thanh chạy vô định (bước đơn không đo được).
  function progressInfo() {
    if (!anyBusy) return null
    if (busy === 'images') {
      return { label: `${t('mockup.progGen')} ${doneCount}/${count}`, percent: count ? (doneCount / count) * 100 : null }
    }
    if (busy === 'auto' || busy === 'combo') {
      if (images.length) {
        return { label: `${t('mockup.autoDash')} ${t('mockup.progAutoGen')} ${doneCount}/${count}`, percent: 55 + (count ? (doneCount / count) * 45 : 0) }
      }
      // Step ids (stable) → percent; the displayed label comes from t().
      const stepPct = { read: 8, sizecmp: 22, getimg: 32, scenes: 42, prompt: 52, genimg: 55 }
      const stepLabelKey = {
        read: isText ? 'mockup.step_readText' : 'mockup.step_readLink',
        sizecmp: 'mockup.step_sizecmp',
        getimg: 'mockup.step_getimg',
        scenes: 'mockup.step_scenes',
        prompt: 'mockup.step_prompt',
        genimg: 'mockup.step_genimg',
      }
      const label = autoStep ? t(stepLabelKey[autoStep]) : t('mockup.preparing')
      return { label: `${t('mockup.autoDash')} ${label}`, percent: stepPct[autoStep] ?? 4 }
    }
    if (busy === 'content') return { label: t('mockup.progReading'), percent: null }
    if (busy === 'scenes') return { label: t('mockup.progScenes'), percent: null }
    if (busy === 'prompt') return { label: t('mockup.progPrompt'), percent: null }
    return { label: t('mockup.progWorking'), percent: null }
  }
  const progress = progressInfo()

  const sceneCount = mode === 'combo' ? REQUIRED_COUNT : count

  // Trả về HAI phần tử anh em: cột giữa và cột phải. App xếp thẳng chúng vào
  // lưới .shell nên không phải nâng state lên trên — state vẫn nằm ở đây.
  const goTitle = mode === 'combo' ? t('mockup.comboBtn') : t('mockup.primaryFree')
  const goBusy = busy === 'combo' || busy === 'auto'
  const shotLabel = { 'close-up': t('mockup.shotCloseup'), medium: t('mockup.shotMedium'), wide: t('mockup.shotWide'), human: t('mockup.shotHuman') }

  const togglePanel = (k) => setOpenPanels((p) => ({ ...p, [k]: !p[k] }))

  // Tóm tắt hiện ngay trên đầu panel khi đang gập — gập mà không nói gì bên
  // trong có gì thì người dùng phải mở ra mới biết, tức là không gập được.
  const contentSummary = [content.name, content.category, niche].filter(Boolean).join(' · ')
  const scenesSummary = mode === 'combo'
    ? t('mockup.fixedScenes')
    : `${sceneCount} · ${scenes.filter(Boolean).length ? t('mockup.scenesNote') : t('mockup.stepScenesHint')}`

  return (
    <>
      {/* ============ CỘT GIỮA ============
          Ba tầng: thanh nguồn · vùng cuộn riêng cho Content/Phối cảnh · khung
          xem ảnh CỐ ĐỊNH. Ảnh là thứ người dùng nhìn nhiều nhất nên không bao
          giờ được cuộn mất. */}
      <section className="mid" hidden={hidden}>
        {bars}

        <div className="mid-bar">
          {/* Nguồn + link + ảnh tham chiếu gom thành MỘT ô nhập: cả ba cùng trả
              lời một câu "sản phẩm này là gì", tách ra hai cột là bắt người dùng
              nhìn hai nơi cho một việc. */}
          <div className="src-group">
            <div className="mode-switch">
              <button className={source === 'link' ? 'seg active' : 'seg'} onClick={() => setSource?.('link')}><IcLink /> {t('src.link')}</button>
              <button className={source === 'text' ? 'seg active' : 'seg'} onClick={() => setSource?.('text')}><IcText /> {t('src.text')}</button>
            </div>
            {isText ? (
              <span className="ob-label grow">{pasteText.trim() ? pasteText.trim().slice(0, 60) : t('src.pastePh').slice(0, 46)}</span>
            ) : (
              <input className="grow bare" value={url || ''} onChange={(e) => setUrl?.(e.target.value)} placeholder="https://…" />
            )}
          </div>

          {/* Run mode đứng cạnh nút chạy: nó quyết định nút kia chạy kiểu gì,
              để tận cột thứ ba là tách hai thứ dính nhau ra hai đầu màn hình.
              Icon CỐ Ý trùng với icon user sẽ gặp sau đó: Auto mang tia sét y
              như nút chạy, Manual mang icon chạy-từ-bước của StepList. */}
          <div className="mode-switch big flow-switch" data-flow={flow} title={flow === 'auto' ? t('flow.autoHint') : t('flow.manualHint')}>
            <button className={flow === 'auto' ? 'seg active' : 'seg'} title={t('flow.autoHint')} onClick={() => setFlow?.('auto')}><IcBolt size={13} /> {t('flow.auto')}</button>
            <button className={flow === 'manual' ? 'seg active' : 'seg'} title={t('flow.manualHint')} onClick={() => setFlow?.('manual')}><IcPlayFrom size={13} /> {t('flow.manual')}</button>
          </div>

          <button
            className={'ico warn' + (anyBusy ? '' : ' off')}
            title={t('mockup.cancel')}
            aria-label={t('mockup.cancel')}
            onClick={cancelRun}
          >
            <IcClose size={14} />
          </button>
          {/* MỘT nút chạy cả workflow, ở CẢ Auto lẫn Manual. Nhãn TĨNH (không
              đổi theo Combo/Custom) nên nút không bao giờ đổi bề ngang — kiểu
              mockup đã nói ở cột phải rồi, không cần nhét vào nhãn nút. */}
          <button
            className="btn-go"
            title={goTitle}
            disabled={anyBusy}
            onClick={() => autoAll(mode === 'combo' ? { combo: true } : undefined)}
          >
            {goBusy ? <span className="spin" /> : <IcBolt />}
            {cancelled ? t('mockup.cancelled') : t('mockup.runAll')}
          </button>
        </div>

        {/* Ảnh tham chiếu: hàng riêng ngay dưới link, ô đủ to để NHÌN được ảnh.
            Nhét vào trong ô nhập thì phải thu nhỏ còn 32px — nhìn không ra gì. */}
        <div className="ref-row">
          {refSlot}
          <p className="hint">{t('ref.hint')}</p>
        </div>

        <div className="mid-scroll">
          {isText && (
            <section className="panel">
              <div className="phead"><span className="idx"><IcText size={13} /></span><h2>{t('src.text')}</h2></div>
              <textarea rows={3} value={pasteText} onChange={(e) => setPasteText?.(e.target.value)} placeholder={t('src.pastePh')} />
            </section>
          )}

          {/* 1 · Thông tin sản phẩm — gập/mở; Auto thì gập sẵn */}
          <section className="panel">
            <button className="sec-head" onClick={() => togglePanel('content')} aria-expanded={openPanels.content}>
              <h2>{t('mockup.contentTitle')}</h2>
              <span className="note">{contentSummary || t('mockup.editable')}</span>
              <span className={openPanels.content ? 'chev open' : 'chev'}><IcChevron size={14} /></span>
            </button>
            {openPanels.content && (
              <div className="panel-body">
                <label className="lbl">{t('mockup.name')}</label>
                <input value={content.name} onChange={(e) => setContent({ ...content, name: e.target.value })} />
                <label className="lbl">{t('mockup.category')}</label>
                <input value={content.category} onChange={(e) => setContent({ ...content, category: e.target.value })} />
                <label className="lbl">{t('mockup.designTheme')}</label>
                <input value={content.designTheme} onChange={(e) => setContent({ ...content, designTheme: e.target.value })} placeholder={t('mockup.designThemePh')} />
                <label className="lbl">{t('mockup.niche')}</label>
                <input value={niche} onChange={(e) => setNiche(e.target.value)} placeholder={t('mockup.nichePh')} />
                <details className="mini-adv">
                  <summary>{t('mockup.features')} · {t('mockup.description')}</summary>
                  {/* Không lặp lại nhãn Features — summary ngay trên đã ghi. */}
                  <textarea rows={3} value={(content.features || []).join('\n')} onChange={(e) => setContent({ ...content, features: e.target.value.split('\n').filter(Boolean) })} />
                  <label className="lbl">{t('mockup.description')}</label>
                  <textarea rows={2} value={content.description} onChange={(e) => setContent({ ...content, description: e.target.value })} />
                </details>
              </div>
            )}
          </section>

          {error && <div className="error">{error}</div>}

          {/* 2 · Phối cảnh — gập/mở */}
          <section className="panel">
            <button className="sec-head" onClick={() => togglePanel('scenes')} aria-expanded={openPanels.scenes}>
              <h2>{t('mockup.scenesTitle')}</h2>
              <span className="note">{scenesSummary}</span>
              <span className={openPanels.scenes ? 'chev open' : 'chev'}><IcChevron size={14} /></span>
            </button>
            {openPanels.scenes && (
              <div className="panel-body">
                {mode === 'free' && (
                  <div className="row" style={{ marginBottom: 10 }}>
                    <button className="ico ghost" disabled={busy === 'scenes'} title={t('mockup.suggestA') + ' ' + count + ' ' + t('mockup.suggestB')} aria-label={t('mockup.suggestA') + ' ' + count + ' ' + t('mockup.suggestB')} onClick={autoGenScenes}>
                      {busy === 'scenes' ? <span className="spin" /> : <IcSparkle />}
                    </button>
                    <span className="ob-label">{t('mockup.suggestA')} <b className="num-fix">{count}</b> {t('mockup.suggestB')}</span>
                  </div>
                )}
                <div className="scenes-list">
                  {Array.from({ length: sceneCount }, (_, i) => {
                    const curShot = shotOf(i)
                    const isCombo = mode === 'combo'
                    return (
                      <div className={isCombo ? 'scene-row req' : 'scene-row'} key={i}>
                        <span className="scene-idx">{i + 1}</span>
                        <div className="scene-main">
                          <div className="scene-ctl">
                            {isCombo && <span className="req-tag">{reqLabel(REQUIRED_SCENES[i])}</span>}
                            {!isCombo && (
                              <div className="shot-seg">
                                {SHOTS.map((s) => (
                                  <button key={s} className={curShot === s ? 'seg2 active' : 'seg2'} onClick={() => setShotAt(i, s)}>{shotLabel[s]}</button>
                                ))}
                              </div>
                            )}
                            <button className="ico sm ghost" title={t('mockup.reoptimize')} aria-label={t('mockup.reoptimize')} disabled={reoptIdx === i} onClick={() => reoptimizeScene(i)}>
                              {reoptIdx === i ? <span className="spin" /> : <IcRefresh size={13} />}
                            </button>
                          </div>
                          <input value={scenes[i] || ''} onChange={(e) => setSceneAt(i, e.target.value)} placeholder={isCombo ? reqLabel(REQUIRED_SCENES[i]) : SCENE_VARIATIONS[i % SCENE_VARIATIONS.length]} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="hint">{mode === 'combo' ? t('mockup.comboScenesHint') : t('mockup.scenesHint')}</p>
              </div>
            )}
          </section>
        </div>

        {/* ---- Khung kết quả: khối cố định, LƯỚI ảnh cuộn bên trong ----
             Đã thử một-ảnh-lớn + dải thumbnail: ảnh dọc thì tràn khỏi khung,
             ảnh nhỏ thì lọt thỏm, mà muốn so mấy tấm phải bấm qua lại từng cái.
             Lưới cho thấy tất cả cùng lúc — chọn ảnh vốn là việc SO SÁNH. */}
        <div className="preview-pane">
          <div className="sec-head">
            <h2>{t('mockup.preview')}</h2>
            <span className="note">
              {images.length > 0 ? `${doneCount}/${images.length} · ${resolvedRatio}` : resolvedRatio}
            </span>
            <span className="spread" />
            <button className="ico sm ghost" disabled={doneCount === 0} title={'ZIP (' + doneCount + ')'} aria-label={'ZIP (' + doneCount + ')'} onClick={downloadZip}><IcDownload size={13} /></button>
            <button className="ico sm ghost" disabled={images.length === 0} title={t('mockup.clearOutput')} aria-label={t('mockup.clearOutput')} onClick={() => setImages([])}><IcTrash size={13} /></button>
          </div>

          <div className="pv-body">
            {images.length === 0 ? (
              <div className="empty">
                {refImage ? (
                  <img className="empty-ref" src={refImage.dataUrl} alt="reference preview" />
                ) : (
                  <div className="empty-frame"><IcDiamond size={26} /></div>
                )}
                <p className="empty-text">
                  {t('mockup.emptyA')} {isText ? t('mockup.emptyPasteText') : t('mockup.emptyPasteUrl')} {t('mockup.emptyAbove')}
                  {isText ? t('mockup.emptyUpload') : ''} {t('mockup.emptyThen')} <b>{t('mockup.runAll')}</b> {t('mockup.emptyResult')}
                </p>
              </div>
            ) : (
              <div className="grid">
                {images.map((img, i) => (
                  <div className={['tile', img?.combo ? 'combo' : '', sentUrls?.has(img?.dataUrl) ? 'is-sent' : ''].filter(Boolean).join(' ')} key={i}>
                    <div className="tile-top">
                      <span className="tile-scene" title={img?.scene}>
                        {img?.status === 'done' && img.dataUrl === refImage?.dataUrl && <span className="ref-badge">{t('mockup.refBadge')}</span>}
                        {img?.scene}
                      </span>
                    </div>
                    {/* contain chứ không cover: cắt mất nửa tấm ảnh để cho vừa ô
                        là làm hỏng đúng thứ người dùng đang cần nhìn. */}
                    <div className="tile-frame">
                      {img?.status === 'loading' && <div className="ph"><span className="spin" />{img?.note || t('mockup.generating')}</div>}
                      {img?.status === 'error' && <div className="ph err">{img.error}</div>}
                      {img?.status === 'done' && <img src={img.dataUrl} alt={'mockup ' + (i + 1)} onClick={() => setZoom(img.dataUrl)} />}
                    </div>
                    <div className="tile-foot">
                      {img?.status === 'done' ? (
                        <div className="tile-actions2">
                          {/* Đẩy sang Content FB là việc CHÍNH ở ô ảnh — cho
                              hẳn chữ, đừng để lẫn vào đám icon xám giống nhau. */}
                          {/* Đã gửi rồi thì khoá nút và đổi icon sang dấu tích.
                              Giữ NGUYÊN chữ "→ Content" để nút không đổi bề
                              ngang — đổi nhãn là cả hàng nút nhảy chỗ. */}
                          {(() => {
                            const sent = sentUrls?.has(img.dataUrl)
                            return (
                              <button
                                className={sent ? 'btn-fb sent' : 'btn-fb'}
                                disabled={sent}
                                title={sent ? t('mockup.sentToContent') : t('mockup.actToContent')}
                                onClick={() => sendToContent?.(img.dataUrl)}
                              >
                                {sent ? <IcCheck size={13} /> : <IcFacebook size={13} />} {t('mockup.toContent')}
                              </button>
                            )
                          })()}
                          <button className="ico sm ghost" title="PNG" aria-label="PNG" onClick={() => downloadOne(i)}><IcDownload size={13} /></button>
                          <button className="ico sm ghost" title={t('mockup.actRedo')} aria-label={t('mockup.actRedo')} onClick={() => genOne(i, basePrompt, undefined, undefined, undefined, undefined, undefined, images[i]?.combo)}><IcRefresh size={13} /></button>
                          <button
                            className="ico sm ghost"
                            title={t('mockup.moreActions')}
                            aria-label={t('mockup.moreActions')}
                            onClick={(e) => {
                              e.stopPropagation()
                              const r = e.currentTarget.getBoundingClientRect()
                              setMenu(menu?.i === i ? null : { i, x: r.right, y: r.top })
                            }}
                          >
                            <IcDots size={13} />
                          </button>
                        </div>
                      ) : img?.status === 'error' ? (
                        <div className="tile-actions2">
                          <button className="ico sm warn" title={t('mockup.retry')} aria-label={t('mockup.retry')} onClick={() => genOne(i, basePrompt, undefined, undefined, undefined, undefined, undefined, images[i]?.combo)}><IcRefresh size={13} /></button>
                        </div>
                      ) : (
                        <span className="tile-scene">…</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ============ CỘT PHẢI — điều khiển ============ */}
      <aside className="cfg" hidden={hidden}>
        <div className="fold">
          <span className="ob-label">{t('mockup.typeLabel')}</span>
          <div className="mode-switch" style={{ width: '100%', marginTop: 6 }}>
            <button className={mode === 'combo' ? 'seg active combo' : 'seg'} style={{ flex: 1 }} title={t('mockup.modeCombo')} onClick={() => switchMode('combo')}><IcFilm /> {t('mockup.typeCombo')}</button>
            <button className={mode === 'free' ? 'seg active' : 'seg'} style={{ flex: 1 }} title={t('mockup.modeFree')} onClick={() => switchMode('free')}><IcSliders /> {t('mockup.typeFree')}</button>
          </div>
          {mode === 'free' ? (
            <div className="cta-count" style={{ marginTop: 10 }}>
              <span className="ob-label">{t('mockup.count')} <b className="count num-fix">{count}</b></span>
              <input className="range" type="range" min={1} max={10} value={count} onChange={(e) => setCount(+e.target.value)} />
            </div>
          ) : (
            <p className="hint">{t('mockup.comboHint')}</p>
          )}
        </div>

        {/* Manual: bốn bước, mỗi bước hai nút icon — chạy tiếp từ đây / chỉ chạy bước này */}
        {flow === 'manual' && (
          <div className="fold">
            <StepList
              steps={[
                {
                  id: 'content', label: t('mockup.stepContent'),
                  hint: content.name || t('mockup.stepContentHint'),
                  done: Boolean(content.name), busy: busy === 'content',
                  disabled: !hasInput, disabledNote: needInputMsg,
                  onRunFrom: () => runPipeline(0), onRunOnly: () => runPipeline(0, { only: true }),
                },
                {
                  id: 'scenes', label: t('mockup.stepScenes'),
                  hint: scenes.filter(Boolean).length ? scenes.filter(Boolean).length + ' ' + t('mockup.stepScenesUnit') : t('mockup.stepScenesHint'),
                  done: scenes.filter(Boolean).length > 0, busy: busy === 'scenes',
                  disabled: mode === 'combo', disabledNote: t('mockup.stepScenesCombo'),
                  onRunFrom: () => runPipeline(1), onRunOnly: () => runPipeline(1, { only: true }),
                },
                {
                  id: 'prompt', label: t('mockup.stepPrompt'),
                  hint: basePrompt ? basePrompt.slice(0, 40) + '…' : t('mockup.stepPromptHint'),
                  done: Boolean(basePrompt), busy: busy === 'prompt',
                  onRunFrom: () => runPipeline(2), onRunOnly: () => runPipeline(2, { only: true }),
                },
                {
                  id: 'images', label: t('mockup.stepImages'),
                  hint: doneCount > 0 ? doneCount + '/' + sceneCount : t('mockup.stepImagesHint'),
                  done: doneCount > 0, busy: busy === 'images',
                  disabled: !basePrompt, disabledNote: t('mockup.genNeedPrompt'),
                  onRunOnly: () => runPipeline(3, { only: true }),
                },
              ]}
            />
          </div>
        )}


        {/* Chỉ Tùy biến mới có góc camera + brief; Combo tự lo phối cảnh. */}
        {mode === 'free' && (
          <>
            <div className="fold">
              <span className="ob-label"><IcCamera /> {t('mockup.cameraTitle')} <b className="num-fix">{angleKeys.size}</b>/16</span>
              <div className="row" style={{ margin: '8px 0' }}>
                <button className="chip mini" onClick={() => setAngleKeys(new Set(DEFAULT_ANGLE_KEYS))}>{t('mockup.angleDiverse')}</button>
                <button className="chip mini" onClick={() => setAngleKeys(new Set(CAMERA_ANGLES.map((a) => a.key)))}>{t('mockup.angleAll')}</button>
                <button className="chip mini" onClick={() => setAngleKeys(new Set())}>{t('mockup.angleNone')}</button>
              </div>
              <div className="anggrid">
                {CAMERA_ANGLES.map((a) => (
                  <button
                    key={a.key}
                    className={angleKeys.has(a.key) ? 'ang active' : 'ang'}
                    title={angleLabel(a) + ' · ' + (a.focus === 'design' ? t('mockup.focusDesign') : a.focus === 'function' ? t('mockup.focusFunction') : t('mockup.focusBoth'))}
                    aria-label={angleLabel(a)}
                    aria-pressed={angleKeys.has(a.key)}
                    onClick={() => toggleAngle(a.key)}
                  >
                    <AngleThumb viz={a.viz} shot={a.shot} focus={a.focus} />
                  </button>
                ))}
              </div>
              <div className="legend">
                <span><i style={{ background: '#8fa0ee' }} />{t('mockup.legendFunction')}</span>
                <span><i style={{ background: '#6fce9b' }} />{t('mockup.legendDesign')}</span>
                <span><i style={{ background: '#8a8f98' }} />{t('mockup.legendBoth')}</span>
              </div>
              <p className="hint">
                {angleKeys.size === 0
                  ? t('mockup.angleEmptyHint')
                  : t('mockup.anglePickedA') + ': ' + CAMERA_ANGLES.filter((a) => angleKeys.has(a.key)).map(angleLabel).join(' · ')}
              </p>
            </div>

            <div className="fold">
              <span className="ob-label">{t('mockup.qtyLabel')}</span>
              <div className="row" style={{ marginTop: 6 }} title={t('mockup.qtyHint')}>
                <button className={!matchRef ? 'chip active' : 'chip'} onClick={() => setMatchRef(false)}>{t('mockup.qtySingle')}</button>
                <button className={matchRef ? 'chip active' : 'chip'} onClick={() => setMatchRef(true)}>{t('mockup.qtyMatch')}</button>
              </div>
              <span className="ob-label" style={{ display: 'block', marginTop: 10 }}>{t('mockup.prominence')}</span>
              <div className="row" style={{ marginTop: 6 }}>
                {[['small', t('mockup.small')], ['medium', t('mockup.medium')], ['large', t('mockup.large')]].map(([v, lbl]) => (
                  <button key={v} className={prominence === v ? 'chip active' : 'chip'} onClick={() => setProminence(v)}>{lbl}</button>
                ))}
              </div>
              <label className="lbl">{t('mockup.sizeCmp')}</label>
              <input value={sizeCmp.comparison} onChange={(e) => setSizeCmp({ ...sizeCmp, comparison: e.target.value })} placeholder={t('mockup.sizeCmpPh')} />
              {(sizeCmp.anchors.length > 0 || sizeCmp.sizeClass) && (
                <p className="hint">
                  {sizeCmp.sizeClass && <>{t('mockup.sizeClass')}: <b>{sizeCmp.sizeClass}</b>{['tiny', 'small'].includes(sizeCmp.sizeClass) ? t('mockup.forceCloseup') : ''} · </>}
                  {t('mockup.anchors')}: {sizeCmp.anchors.join(' · ') || '—'}
                </p>
              )}
            </div>

            <div className="fold">
              <label className="checkline">
                <input type="checkbox" checked={skipInfo} onChange={(e) => setSkipInfo(e.target.checked)} />
                <span>{t('mockup.skipInfo')}</span>
              </label>
              {!skipInfo && (
                <>
                  <label className="lbl">{t('mockup.material')}</label>
                  <input value={brief.material} onChange={(e) => setBrief({ ...brief, material: e.target.value })} placeholder={t('mockup.materialPh')} />
                  <label className="lbl">{t('mockup.dimensions')}</label>
                  <input value={brief.dimensions} onChange={(e) => setBrief({ ...brief, dimensions: e.target.value })} placeholder={t('mockup.dimensionsPh')} />
                  <label className="lbl">{t('mockup.production')}</label>
                  <input value={brief.production} onChange={(e) => setBrief({ ...brief, production: e.target.value })} placeholder={t('mockup.productionPh')} />
                  <label className="lbl">{t('mockup.orientation')}</label>
                  <div className="row">
                    {['landscape', 'portrait', 'square', '3D'].map((o) => (
                      <button key={o} className={brief.orientation === o ? 'chip active' : 'chip'} onClick={() => setBrief({ ...brief, orientation: o })}>{o}</button>
                    ))}
                  </div>
                  <label className="lbl">{t('mockup.placement')}</label>
                  <input value={brief.placement} onChange={(e) => setBrief({ ...brief, placement: e.target.value })} placeholder={t('mockup.placementPh')} />
                </>
              )}
            </div>

            <div className="fold">
              <div className="row">
                <span className="ob-label grow">{t('mockup.promptTitle')}</span>
                <button className="ico ghost" disabled={busy === 'prompt'} title={t('mockup.promptBtn')} aria-label={t('mockup.promptBtn')} onClick={autoGenPrompt}>
                  {busy === 'prompt' ? <span className="spin" /> : <IcSparkle />}
                </button>
              </div>
              <textarea rows={3} value={basePrompt} onChange={(e) => setBasePrompt(e.target.value)} placeholder={t('mockup.promptPh')} />
            </div>
          </>
        )}

        {cfgBottom}
      </aside>

      {menu && (() => {
        const img = images[menu.i]
        if (img?.status !== 'done') return null
        const isRef = img.dataUrl === refImage?.dataUrl
        const pick = (fn) => (e) => { e.stopPropagation(); fn(); setMenu(null) }
        return (
          <div ref={menuRef} className="tile-menu fixed" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
            <button onClick={pick(() => editTile(menu.i, 'bg'))}><IcImage size={13} /> {t('mockup.actBg')}</button>
            <button onClick={pick(() => editTile(menu.i, 'down'))}><IcShrink size={13} /> {t('mockup.actDown')}</button>
            <button onClick={pick(() => editTile(menu.i, 'up'))}><IcGrow size={13} /> {t('mockup.actUp')}</button>
            <button
              className={isRef ? 'active' : ''}
              disabled={refSlotsFull && !isRef}
              title={refSlotsFull && !isRef ? t('ref.allFull') : ''}
              onClick={pick(() => toRef(menu.i))}
            >
              <IcStar size={13} filled={isRef} /> {t('mockup.actRef')}
            </button>
          </div>
        )
      })()}

      {zoom && <Lightbox src={zoom} onClose={() => setZoom(null)} />}
      {progress && <ProgressBar label={progress.label} percent={progress.percent} />}
    </>
  )
}
