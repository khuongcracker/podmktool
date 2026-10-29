// Tải trang product ở phía server rồi trả về text đã làm sạch.
//
// Vì sao cần: trước đây bước đọc URL dùng `url_context` — tính năng riêng của
// Gemini — nên GPT không bao giờ làm được bước này. Fetch ở server thì model
// nào cũng đọc được cùng một nội dung, và không dính CORS như fetch từ browser.

const MAX_BYTES = 2_000_000
const MAX_TEXT = 24_000
const TIMEOUT_MS = Number(process.env.PAGE_TIMEOUT_MS || 20_000)

// Chặn SSRF: URL do người dùng nhập, không được để nó trỏ vào mạng nội bộ
// và biến server thành cầu quét cổng.
const BLOCKED_HOST = /^(localhost|127\.|0\.|10\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$)/i

export function assertPublicUrl(raw) {
  let u
  try {
    u = new URL(raw)
  } catch {
    throw new Error('URL không hợp lệ.')
  }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Chỉ chấp nhận http/https.')
  if (BLOCKED_HOST.test(u.hostname)) throw new Error('Không cho phép địa chỉ nội bộ.')
  return u
}

// Chọn ảnh SẢN PHẨM trên trang, bỏ ảnh giao diện.
//
// Lọc bằng từ khoá là không đủ — thử thật trên macorner.co thì 24/25 ảnh trả về
// là icon tìm kiếm, banner menu, ảnh footer, size chart, ảnh hướng dẫn các bước.
// Nên chuyển sang CHẤM ĐIỂM, với tín hiệu mạnh nhất rút ra từ dữ liệu thật:
// tên file ảnh sản phẩm TRÙNG SLUG của sản phẩm
// (…/files/birth-flower-cross-…-personalized-mug-1.jpg cho trang
//  /products/birth-flower-cross-…-personalized-mug-ma6kz0e3o).

// Tên file bỏ hậu tố kích thước của Shopify. Cùng một ảnh được phục vụ dưới
// nhiều tên: foo.jpg, foo_1200x.jpg, foo_480x480.jpg, foo_100x100@2x.jpg —
// khử trùng theo tên file thô vẫn để lọt (đã gặp thật trên wrappiness.co:
// vOY2n4iClf__mk-df.jpg và vOY2n4iClf__mk-df_1200x.jpg là một tấm).
function sizeFreeName(pathname) {
  const file = (pathname.split('/').pop() || pathname).toLowerCase()
  const dot = file.lastIndexOf('.')
  const stem = dot === -1 ? file : file.slice(0, dot)
  const ext = dot === -1 ? '' : file.slice(dot)
  return stem.replace(/_\d+x(\d+)?(@\d+x)?$/i, '') + ext
}

// Đường dẫn chắc chắn là giao diện, loại thẳng không cần chấm.
const THEME_PATH = /\/(assets|t\/\d+\/assets)\//i
const CHROME = /(sprite|icon|logo|favicon|placeholder|loading|spinner|badge|payment|flag|banner|menu|nav|header|footer|search|collection|blog|avatar|review|trust|guarantee|social|arrow|size[-_]?chart|step\d)/i

const STOP = new Set([
  'the','and','for','you','are','with','your','our','personalized','custom','gift','gifts',
  'a','an','of','to','in','on','my','me','is','it','be','by','or','from','best','new',
])

// Token đặc trưng của sản phẩm: lấy từ slug URL + tiêu đề trang.
function productTokens(pageUrl, title) {
  const slug = decodeURIComponent(new URL(pageUrl).pathname.split('/').filter(Boolean).pop() || '')
  const raw = (slug + ' ' + (title || '')).toLowerCase()
  return new Set(
    raw
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w))
  )
}

function scoreImage(href, tokens, fromJsonLd) {
  const u = new URL(href)
  const path = u.pathname.toLowerCase()
  if (THEME_PATH.test(path)) return -1            // asset của theme -> chắc chắn không phải sản phẩm

  const w = Number(u.searchParams.get('width') || u.searchParams.get('w') || 0)
  let score = 0
  if (fromJsonLd) score += 100
  if (CHROME.test(path)) score -= 60
  if (w && w < 300) score -= 40
  else if (w >= 800) score += 10

  // Tín hiệu chính: tên file chia sẻ bao nhiêu token với slug sản phẩm.
  const file = path.split('/').pop() || ''
  const fileTokens = file.split(/[^a-z0-9]+/).filter((x) => x.length >= 4)
  const hits = fileTokens.filter((x) => tokens.has(x)).length
  score += hits * 25

  return score
}

function collectImages(html, baseUrl, title, ogAbs) {
  // Khoá khử trùng bỏ QUA protocol và tham số kích thước: cùng một ảnh phục vụ
  // ở http/https và nhiều width phải coi là MỘT, nếu không các ô Sub Ref sẽ đầy
  // ảnh trùng ở các cỡ khác nhau. Giữ bản width lớn nhất.
  const best = new Map()
  const add = (raw, fromJsonLd = false) => {
    if (!raw) return
    // Cùng một ảnh xuất hiện dưới nhiều dạng bẩn khác nhau trên cùng một trang:
    //   - HTML entity chưa giải mã:  ...?v=1&amp;width=750
    //   - escape kiểu JSON:          ...&width=1920  và  \/cdn\/shop\/
    //   - dấu gạch nhân đôi:         //cdn//shop//files//
    // Không chuẩn hoá thì mỗi dạng thành một "ảnh" riêng và các ô Sub Ref sẽ
    // đầy cùng một tấm.
    let u = raw
      .trim()
      .split(/\s+/)[0]
      .replace(/\\u0026/gi, '&')
      .replace(/&amp;/gi, '&')
      .replace(/\\\//g, '/')
    if (!u || u.startsWith('data:')) return
    if (!/\.(jpe?g|png|webp|avif)(\?|$)/i.test(u)) return
    let abs
    try { abs = new URL(u, baseUrl) } catch (_) { return }
    abs.pathname = abs.pathname.replace(/\/{2,}/g, '/')

    const w = Number(abs.searchParams.get('width') || abs.searchParams.get('w') || 0)
    // Khoá khử trùng = TÊN FILE. Shopify phục vụ cùng một ảnh qua cả
    // macorner.co lẫn cdn.shopify.com, qua http lẫn https, ở nhiều width —
    // khoá theo host+path vẫn lọt. Tên file là thứ duy nhất ổn định.
    const key = sizeFreeName(abs.pathname)
    const prev = best.get(key)
    if (!prev) best.set(key, { href: abs.href, w, fromJsonLd })
    else {
      if (w > prev.w) { prev.href = abs.href; prev.w = w }
      if (fromJsonLd) prev.fromJsonLd = true
    }
  }

  // og:image là ảnh chính do site tự khai -> ưu tiên cao nhất. Cho nó đi qua
  // CÙNG bộ khử trùng thay vì ghép riêng ở ngoài, nếu không bản http không có
  // tham số width sẽ nằm cạnh bản https có width và thành hai ảnh.
  if (ogAbs) add(ogAbs, true)

  // JSON-LD tiếp theo: Shopify để ảnh sản phẩm sạch nhất ở đây.
  for (const m of html.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+")/gi)) {
    const raw = m[1]
    if (raw.startsWith('[')) raw.match(/"([^"]+)"/g)?.forEach((q) => add(q.slice(1, -1), true))
    else add(raw.slice(1, -1), true)
  }
  for (const m of html.matchAll(/<img[^>]+>/gi)) {
    const tag = m[0]
    add(tag.match(/\ssrc=["']([^"']+)["']/i)?.[1])
    add(tag.match(/\sdata-src=["']([^"']+)["']/i)?.[1])
    const srcset = tag.match(/\ssrcset=["']([^"']+)["']/i)?.[1]
    if (srcset) srcset.split(',').forEach((c) => add(c))
  }

  const tokens = productTokens(baseUrl, title)
  const scored = [...best.values()]
    .map((x) => ({
      ...x,
      score:
        scoreImage(x.href, tokens, x.fromJsonLd) +
        // Giữ og:image đứng đầu danh sách -> nó thành Main Ref mặc định.
        (ogAbs && x.href.split('/').pop().split('?')[0] === ogAbs.split('/').pop().split('?')[0] ? 500 : 0),
    }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score)

  // Ảnh khớp slug sản phẩm đứng trước. Nhưng KHÔNG cắt bỏ phần còn lại: có
  // trang chỉ lộ 1-2 ảnh khớp trong HTML thô (gallery render bằng JS), cắt hết
  // là user chỉ đổ được 2 ô rồi báo "hết ảnh". Thiếu thì bù bằng ảnh điểm thấp
  // hơn — thứ tự vẫn ưu tiên ảnh sản phẩm, user tự bỏ ô nào không ưng.
  const MIN_CANDIDATES = 6
  const strong = scored.filter((x) => x.score >= 25)
  const rest = scored.filter((x) => x.score < 25)
  const out = strong.length >= MIN_CANDIDATES ? strong : [...strong, ...rest]
  return out.map((x) => x.href).slice(0, 24)
}

const strip = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()

const meta = (html, prop) => {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']+)["']`,
    'i'
  )
  const m = html.match(re) || html.match(
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${prop}["']`, 'i')
  )
  return m ? m[1] : ''
}

export async function fetchPage(rawUrl) {
  const u = assertPublicUrl(rawUrl)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetch(u.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Nhiều site POD trả nội dung rỗng cho user-agent lạ.
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
  } catch (e) {
    throw new Error(
      e.name === 'AbortError'
        ? `Trang không phản hồi trong ${TIMEOUT_MS / 1000}s.`
        : `Không tải được trang: ${e.message}`
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) throw new Error(`Trang trả về HTTP ${res.status}.`)

  const buf = await res.arrayBuffer()
  if (buf.byteLength > MAX_BYTES) throw new Error('Trang quá lớn.')
  const html = new TextDecoder('utf-8').decode(buf)

  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()

  // Shopify: /products/<handle> luôn có bản JSON kèm ĐẦY ĐỦ ảnh sản phẩm.
  // Dùng được thì không phải đoán từ HTML nữa — đây là nguồn chính xác nhất.
  let shopifyImages = []
  if (/\/products\/[^/]+$/.test(u.pathname)) {
    try {
      const r = await fetch(u.origin + u.pathname + '.json', {
        headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      })
      if (r.ok) {
        const j = await r.json()
        shopifyImages = (j?.product?.images || []).map((im) => im.src).filter(Boolean)
      }
    } catch (_) {
      // Không phải Shopify, hoặc bị chặn -> im lặng dùng cách đoán từ HTML.
    }
  }
  const ogImage = meta(html, 'og:image') || meta(html, 'twitter:image')
  const text = strip(html).slice(0, MAX_TEXT)
  const ogAbs = ogImage ? new URL(ogImage, u.href).href : ''
  // og:image đứng đầu (ảnh mặc định), phần còn lại là các góc chụp bổ sung.
  // Ảnh từ Shopify JSON đứng trước, rồi mới tới ảnh đoán từ HTML (đã khử trùng
  // theo tên file nên hai nguồn không tạo ra bản sao).
  const guessed = collectImages(html, u.href, title, ogAbs)
  const seen = new Set()
  const gallery = [...shopifyImages, ...guessed].filter((x) => {
    let k
    try { k = sizeFreeName(new URL(x).pathname) } catch (_) { k = x.toLowerCase() }
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })

  // Trang render bằng JS thường ra rất ít text — báo lên để UI khuyên upload tay
  // thay vì để model bịa ra sản phẩm từ một trang rỗng.
  const thin = text.length < 400

  return {
    url: u.href,
    title,
    ogImage: ogAbs,
    images: gallery,
    text,
    thin,
  }
}

// Tải một ảnh về dạng base64. Trước đây frontend phải đi qua 3 proxy CORS của
// bên thứ ba (weserv / allorigins / corsproxy) vì browser không fetch chéo
// domain được. Có backend rồi thì tải thẳng: bớt 3 phụ thuộc ngoài, nhanh hơn,
// và không bị proxy trả về trang lỗi HTML thay cho ảnh.
export async function fetchImage(rawUrl) {
  const u = assertPublicUrl(rawUrl)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res
  try {
    res = await fetch(u.href, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
    })
  } catch (e) {
    throw new Error(
      e.name === 'AbortError' ? 'Tải ảnh quá thời gian.' : `Không tải được ảnh: ${e.message}`
    )
  } finally {
    clearTimeout(timer)
  }
  if (!res.ok) throw new Error(`Ảnh trả về HTTP ${res.status}.`)

  const type = res.headers.get('content-type') || ''
  if (!type.startsWith('image/')) throw new Error('URL này không trả về ảnh.')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 200) throw new Error('Ảnh rỗng hoặc hỏng.')
  if (buf.length > 12_000_000) throw new Error('Ảnh quá lớn.')

  return { mimeType: type.split(';')[0], base64: buf.toString('base64') }
}
