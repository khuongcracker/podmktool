import { apiFetchImage } from './api.js'
// Helpers shared by both pipeline tabs.

// TẠM KHOÁ tỉ lệ về 1:1 cho mọi công cụ (New Mockup + Content FB). Mở lại = đặt null.
export const LOCK_RATIO = '1:1'

export function ratioForOrientation(o) {
  const k = String(o || '').toLowerCase()
  if (k === 'landscape') return '3:2'
  if (k === 'portrait') return '4:5'
  if (k === 'square') return '1:1'
  return null
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = reader.result
      const base64 = res.split(',')[1]
      resolve({ mimeType: file.type || 'image/png', base64, dataUrl: res })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function nearestAspect(w, h) {
  const supported = ['1:1', '3:4', '4:5', '9:16', '4:3', '3:2', '16:9']
  const target = w / h
  let best = '1:1'
  let bestDiff = Infinity
  for (const s of supported) {
    const [a, b] = s.split(':').map(Number)
    const diff = Math.abs(a / b - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = s
    }
  }
  return best
}

function blobToImg(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const out = r.result
      resolve({ mimeType: blob.type || 'image/jpeg', base64: String(out).split(',')[1], dataUrl: out })
    }
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

// Deterministic path: read the page HTML through a CORS proxy and pull the
// og:image / twitter:image meta tag. Works on server-rendered stores (most
// Shopify/POD sites) without needing the AI model. Returns '' if not found.
export async function ogImageFromPage(pageUrl) {
  const proxies = [
    `https://api.allorigins.win/raw?url=${encodeURIComponent(pageUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(pageUrl)}`,
  ]
  for (const p of proxies) {
    try {
      const r = await fetch(p)
      if (!r.ok) continue
      const html = await r.text()
      if (!html || html.length < 500) continue
      const pick = (re) => { const m = html.match(re); return m ? m[1] : '' }
      let img =
        pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
        pick(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
        pick(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)
      if (img) {
        if (img.startsWith('//')) img = 'https:' + img
        return img
      }
    } catch (_) { /* try next proxy */ }
  }
  return ''
}

// Pull a cross-origin product image (from a store page) into base64.
// Frontend can't fetch cross-origin images directly → route via an image proxy.
// Tries several proxies so a single blocked/failed host doesn't kill the feature.
export async function fetchProductImage(imageUrl) {
  // Ưu tiên backend: không CORS, không phụ thuộc dịch vụ ngoài.
  try {
    const r = await apiFetchImage(imageUrl)
    return { ...r, dataUrl: `data:${r.mimeType};base64,${r.base64}` }
  } catch (_) {
    // Backend không lấy được -> rơi về các proxy công cộng như trước.
  }

  const clean = String(imageUrl).replace(/^https?:\/\//, '')
  const proxies = [
    `https://images.weserv.nl/?url=${encodeURIComponent(clean)}`,
    `https://api.allorigins.win/raw?url=${encodeURIComponent(imageUrl)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(imageUrl)}`,
  ]
  let lastErr
  for (const proxied of proxies) {
    try {
      const res = await fetch(proxied)
      if (!res.ok) { lastErr = new Error('proxy HTTP ' + res.status); continue }
      const blob = await res.blob()
      // Guard against proxies that return an HTML error page instead of an image.
      if (blob.size < 200 || (blob.type && !blob.type.startsWith('image/'))) {
        lastErr = new Error('nội dung trả về không phải ảnh')
        continue
      }
      return await blobToImg(blob)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('không tải được ảnh qua proxy nào')
}

// Build a SIZE GUIDE canvas: the product pasted small on a neutral frame at
// the exact fraction it must occupy in the final image. Sent to the image
// model ALONGSIDE the full-res product photo — a full-frame reference biases
// the model toward rendering the product big; showing the target layout as
// pixels overrides that far more reliably than text instructions.
export function composeScaleCanvas(refImage, aspectRatio, fraction) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => {
      const [a, b] = String(aspectRatio || '1:1').split(':').map(Number)
      const W = 1024
      const H = Math.round(W * ((b || 1) / (a || 1)))
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#d9d9d9'
      ctx.fillRect(0, 0, W, H)
      const targetH = H * fraction
      const scale = targetH / im.naturalHeight
      const w = im.naturalWidth * scale
      const h = targetH
      const x = (W - w) / 2
      const y = (H - h) / 2
      ctx.drawImage(im, x, y, w, h)
      const dataUrl = canvas.toDataURL('image/png')
      resolve({ mimeType: 'image/png', base64: dataUrl.split(',')[1], dataUrl })
    }
    im.onerror = reject
    im.src = refImage.dataUrl
  })
}

// How much of the frame height the product should really occupy, by size
// class, nudged by the user's prominence choice.
export function scaleFractionFor(sizeClass, prominence) {
  const base = { tiny: 0.2, small: 0.3, medium: 0.42, large: 0.6 }[sizeClass]
  if (!base) return null
  const nudge = prominence === 'small' ? -0.06 : prominence === 'large' ? 0.08 : 0
  return Math.min(0.75, Math.max(0.12, base + nudge))
}

// Scenes carry an optional shot-type tag: "[close-up] held in a hand…".
// The tag drives per-scene scale rules — a wide shot legitimately shows the
// product small, a close-up legitimately shows it large.
export function parseShotTag(scene) {
  const m = String(scene || '').match(/^\s*\[(close-up|medium|wide|human)\]\s*(.*)$/i)
  return m ? { shot: m[1].toLowerCase(), text: m[2] } : { shot: '', text: String(scene || '') }
}

// Frame fraction by shot type × size class. Same physical size reads very
// differently per camera distance — this is what makes scene variety possible
// without breaking scale.
const SHOT_BASE = {
  'close-up': { tiny: 0.42, small: 0.48, medium: 0.55, large: 0.6, '': 0.5 },
  medium: { tiny: 0.16, small: 0.24, medium: 0.38, large: 0.5, '': 0.3 },
  wide: { tiny: 0.07, small: 0.12, medium: 0.2, large: 0.35, '': 0.15 },
  human: { tiny: 0.14, small: 0.2, medium: 0.35, large: 0.5, '': 0.25 },
}
export function shotFractionFor(sizeClass, shot, prominence) {
  if (shot && SHOT_BASE[shot]) {
    const base = SHOT_BASE[shot][sizeClass || ''] ?? SHOT_BASE[shot]['']
    const nudge = prominence === 'small' ? -0.04 : prominence === 'large' ? 0.06 : 0
    return Math.min(0.8, Math.max(0.05, base + nudge))
  }
  return scaleFractionFor(sizeClass, prominence)
}

// Camera-angle palette the user can pick BEFORE auto-gen. Each angle maps to
// one of the 4 base shot types (close-up/medium/wide/human) so the scale system
// keeps working unchanged, and carries a `focus` telling the scene writer whether
// to showcase the DESIGN (artwork/finish), the FUNCTION (real-world use), or both.
// `prompt` is the fixed English camera clause injected into that scene.
// `label` = Vietnamese UI label, `labelEn` = English UI label (picked by getLang()).
export const CAMERA_ANGLES = [
  { key: 'straight-on',      viz: 'front',   label: 'Chính diện ngang mắt', labelEn: 'Straight-on eye-level', shot: 'medium',   focus: 'both',     prompt: 'straight-on eye-level shot, product squarely facing the camera' },
  { key: 'three-quarter',    viz: 'front34', label: 'Chếch 3/4 trước',      labelEn: '3/4 front',             shot: 'medium',   focus: 'both',     prompt: 'three-quarter front angle at eye level, front and one side visible' },
  { key: 'hero-low',         viz: 'low',     label: 'Góc thấp hùng dũng',   labelEn: 'Low hero angle',        shot: 'medium',   focus: 'both',     prompt: 'low camera angle looking slightly upward, heroic imposing framing' },
  { key: 'high-overview',    viz: 'high',    label: 'Góc cao nhìn xuống',   labelEn: 'High overview',         shot: 'wide',     focus: 'function', prompt: 'high angle looking down over the scene, product seen within its usage context' },
  { key: 'topdown-flatlay',  viz: 'top',     label: 'Flat-lay từ trên',     labelEn: 'Top-down flat-lay',     shot: 'medium',   focus: 'design',   prompt: 'top-down flat-lay directly overhead, the artwork/design lying flat and fully readable' },
  { key: 'macro-detail',     viz: 'macro',   label: 'Macro chất liệu',      labelEn: 'Macro texture',         shot: 'close-up', focus: 'design',   prompt: 'extreme macro close-up on the surface, revealing material texture, print detail and design motifs' },
  { key: 'inuse-closeup',    viz: 'closeup', label: 'Cận cảnh đang dùng',   labelEn: 'In-use close-up',       shot: 'close-up', focus: 'function', prompt: 'close-up of the product actively in use, hands or immediate context showing its function' },
  { key: 'wide-environment', viz: 'env',     label: 'Toàn cảnh môi trường', labelEn: 'Wide environment',      shot: 'wide',     focus: 'function', prompt: 'wide environmental shot placing the product in its real-life setting of use' },
  { key: 'human-hold',       viz: 'human',   label: 'Người cầm/đeo/dùng',   labelEn: 'Person using it',       shot: 'human',    focus: 'function', prompt: 'a person from the target audience naturally holding, wearing, or operating the product' },
  { key: 'over-shoulder',    viz: 'pov',     label: 'Qua vai / POV',        labelEn: 'Over-shoulder / POV',   shot: 'medium',   focus: 'function', prompt: 'over-the-shoulder first-person POV as the user interacts with the product' },
  { key: 'side-profile',     viz: 'side',    label: 'Nhìn nghiêng',         labelEn: 'Side profile',          shot: 'medium',   focus: 'both',     prompt: 'pure side-profile shot at eye level, showing silhouette and thickness' },
  { key: 'back-view',        viz: 'back',    label: 'Mặt sau',              labelEn: 'Back view',             shot: 'medium',   focus: 'design',   prompt: 'back view of the product, revealing the rear design or construction' },
  { key: 'dutch-tilt',       viz: 'tilt',    label: 'Nghiêng năng động',    labelEn: 'Dynamic dutch tilt',    shot: 'medium',   focus: 'both',     prompt: 'dynamic dutch-tilt angle, energetic diagonal composition' },
  { key: 'detail-crop',      viz: 'crop',    label: 'Crop vào artwork',     labelEn: 'Artwork crop',          shot: 'close-up', focus: 'design',   prompt: 'tight crop framing only the key artwork/graphic, the design filling the frame' },
  { key: 'lifestyle-spot',   viz: 'spot',    label: 'Góc đời thường',       labelEn: 'Everyday spot',         shot: 'medium',   focus: 'function', prompt: 'product resting in a lived-in everyday spot (desk, shelf, table) with natural props around' },
  { key: 'three-quarter-back', viz: 'back34', label: 'Chếch 3/4 sau',      labelEn: '3/4 rear',              shot: 'medium',   focus: 'both',     prompt: 'three-quarter rear angle, showing the back and one side together' },
]

// Team's mandatory 4-scene set for every campaign. Each entry plugs into the
// same anglePlan slot shape {shot, focus, prompt} so the first 4 images always
// follow this spec; the AI still writes the concrete setting per product+niche.
export const REQUIRED_SCENES = [
  { key: 'req1', shot: 'close-up', focus: 'design',   label: 'Cận SP + BG niche',      labelEn: 'Close-up + niche BG',   prompt: 'a tight close-up where the product and its DESIGN fill most of the frame and are the clear hero. The background is only a SOFT, blurred, out-of-focus backdrop that evokes the target audience/niche world through colours, mood and a few themed props — this is a styling backdrop, NOT the product\'s functional place of use (that is a different scene). Keep the product and its artwork sharp and dominant.' },
  { key: 'req2', shot: 'human',    focus: 'function', label: 'Model bên cạnh SP',      labelEn: 'Model beside product',  prompt: 'a model / person standing right next to the product, showing scale and context' },
  { key: 'req3', shot: 'wide',     focus: 'function', label: 'Chụp xa, nhiều BG (±model)', labelEn: 'Wide, rich BG (±model)', prompt: 'a wider shot of the product from further away with a richer full background scene, optionally with a person present' },
  { key: 'req4', shot: 'human',    focus: 'function', label: 'Cầm tay / trao tặng',    labelEn: 'Held / gifting',        prompt: 'the product held in a hand, or a warm gift-giving / handing-over moment' },
  // Cảnh 5 (chốt 2026-08-19): design hero + đúng công năng. EXACTLY 1 sản phẩm,
  // design/artwork rõ & đọc được nhất, đặt ĐÚNG nơi dùng thật để thấy ngay công
  // năng (magnet → trên tủ lạnh, decal → trên tường, mug → trên bàn), background
  // bám chủ đề/chức năng sản phẩm, chất liệu/bề mặt render chuẩn (bóng/kim loại/vải…).
  { key: 'req5', shot: 'medium',   focus: 'both',     label: 'Design hero + đúng công năng', labelEn: 'Design hero + in-context', prompt: 'a hero product shot showing the design as clearly, crisply and readably as possible — EXACTLY ONE product, its full artwork visible — placed in its REAL place of use so its function reads instantly. CHOOSE THE BACKGROUND FROM THIS SPECIFIC PRODUCT\'S OWN FUNCTION AND PLACEMENT — a different product type / different function MUST get a different setting; never default to any example. Examples only (do not reuse blindly): a fridge magnet on a refrigerator door, a wall decal on a wall, a mug on a kitchen counter, a doormat by an entrance, a car sticker on a car window. The placement MUST be physically plausible for this exact product — e.g. a handbag is carried, worn on a shoulder, or set on a chair/table (NEVER stuck on a fridge); a magnet goes on metal; a shirt is worn or laid out. The background must be a real setting that matches what THIS product is actually for and its theme. Render the true material, surface and finish accurately (glossy acrylic, brushed metal, ceramic, fabric, vinyl, etc.). Single product only, no duplicates.' },
]
export const REQUIRED_COUNT = REQUIRED_SCENES.length

// Curated diverse default so out-of-box gen already spans function + design.
export const DEFAULT_ANGLE_KEYS = [
  'straight-on', 'three-quarter', 'hero-low', 'topdown-flatlay',
  'macro-detail', 'inuse-closeup', 'wide-environment', 'human-hold',
]

// Spread the chosen angles across `count` scenes. >= count → even spread so all
// kinds show; < count → cycle. Returns null when nothing is selected (→ the
// pipeline falls back to letting the model mix shot types itself, as before).
export function planAngles(selectedKeys, count) {
  const list = CAMERA_ANGLES.filter((a) => selectedKeys.includes(a.key))
  if (!list.length || !count) return null
  if (list.length >= count) {
    return Array.from({ length: count }, (_, i) => list[Math.floor((i * list.length) / count)])
  }
  return Array.from({ length: count }, (_, i) => list[i % list.length])
}

// Crop a normalized [ymin, xmin, ymax, xmax] (0-1000) box out of an image
// dataUrl → small thumbnail dataUrl. Used for element previews.
export function cropBox(dataUrl, box, maxSide = 240) {
  return new Promise((resolve, reject) => {
    const im = new Image()
    im.onload = () => {
      const [ymin, xmin, ymax, xmax] = box
      const sx = (xmin / 1000) * im.naturalWidth
      const sy = (ymin / 1000) * im.naturalHeight
      const sw = Math.max(1, ((xmax - xmin) / 1000) * im.naturalWidth)
      const sh = Math.max(1, ((ymax - ymin) / 1000) * im.naturalHeight)
      const scale = Math.min(1, maxSide / Math.max(sw, sh))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(sw * scale)
      canvas.height = Math.round(sh * scale)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(im, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/png'))
    }
    im.onerror = reject
    im.src = dataUrl
  })
}
