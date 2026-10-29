// Gemini API helper.
// Model KHÔNG còn hardcode ở đây — user chọn trong UI, registry ở
// `./models.js`. Thêm/bớt model thì sửa registry, không đụng file này.

import { parseShotTag } from '../shared.js'
import { apiFetchPage } from '../api.js'
import { callTextBody } from './text.js'
import { callImageBody } from './image.js'
import { outputLanguageLine } from '../i18n.js'

// Distinct scene/background + camera directions so each of the N images
// looks clearly different from the others.
export const SCENE_VARIATIONS = [
  'clean seamless studio backdrop, soft even lighting, straight-on eye-level shot',
  'bright lifestyle setting in a modern home, natural window light, slight 3/4 angle',
  'outdoor scene with greenery and sunlight, shallow depth of field, low angle',
  'minimal flat-lay from directly above on a textured surface, top-down shot',
  'moody dark background with a single dramatic spotlight, close-up detail shot',
  'warm cafe / wooden table setting, cozy ambient light, 45-degree angle',
  'colorful gradient studio background, glossy reflection, dynamic tilted angle',
  'marble surface with soft shadows, editorial magazine look, medium close-up',
  'premium retail shelf display in a boutique store, soft directional light, straight-on shot',
  'gift-wrapped presentation on a festive table with subtle bokeh lights, warm 3/4 angle',
]

// Three deliberately different art directions so the 3 redesign options
// never come back looking like the same idea three times.
export const REDESIGN_DIRECTIONS = [
  'modern minimal: simplified shapes, refined typography, restrained palette, lots of breathing room',
  'vintage / retro: distressed textures, classic typography, warm aged palette, nostalgic feel',
  'bold playful: high contrast colors, chunky shapes, energetic composition, strong visual punch',
]

// Read product info from a URL.
// Nội dung trang do BACKEND tải về (`/api/fetch-page`) rồi mới đưa cho model —
// trước đây bước này dùng `url_context`, tính năng riêng của Gemini, khiến GPT
// không bao giờ chạy được. Fetch ở server thì model nào cũng đọc cùng nội dung.
// POD/Shopify aware: the page <title> is "<Product Name> – <Store>", and the
// core product TYPE sits at the END of the product name (Metal Sign, Denim Cap…).
export async function extractInfoFromUrl(url) {
  const page = await apiFetchPage(url)
  if (page.thin) {
    throw new Error(
      'Trang này gần như không có nội dung đọc được (nhiều khả năng render bằng JS hoặc chặn bot). ' +
      'Upload ảnh sản phẩm tay thay vì dùng link.'
    )
  }

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Below is the extracted content of an e-commerce product page. ` +
              `Extract ONLY real data from it — never invent a different product.

` +
              `PAGE URL: ${page.url}
` +
              `PAGE TITLE: ${page.title}
` +
              `MAIN IMAGE URL (from og:image): ${page.ogImage || '(none found)'}
` +
              `PAGE TEXT:
"""
${page.text}
"""

` +
              `The page TITLE is formatted like "<Product Name> – <Store/Brand>" ` +
              `(the store/brand comes after the LAST " – " en-dash, " | " pipe, or " — "). ` +
              `Product Name = the title with that trailing store/brand suffix removed. ` +
              `The core PRODUCT TYPE is the noun phrase at the END of the product name ` +
              `(e.g. "Metal Sign", "Denim Cap", "Tumbler", "Ornament", "Doormat").

` +
              `Return a JSON object ONLY (no markdown) with keys: ` +
              `"name" (full product name, store/brand removed), ` +
              `"category" (the core product type at the end of the name), ` +
              `"features" (array of short strings taken from the page details), ` +
              `"description" (the real product detail text, 1-3 sentences), ` +
              `"designTheme" (the visual DESIGN THEME of the artwork on the product — motifs, style, message, e.g. "vintage americana eagle + flag", "cute cartoon dachshund", "floral watercolor memorial"), ` +
              `"dimensions" (physical size; use the size stated on the page, otherwise a typical real-world size for this product type, e.g. "18x12 in"), ` +
              `"material" (material / surface finish; from the page, otherwise the typical material for this product type, e.g. "aluminum, sublimated"), ` +
              `"production" (production/print method, e.g. "UV printed", "sublimation", "embroidered" — from the page, otherwise typical for this product type), ` +
              `"orientation" (one of: landscape, portrait, square, or 3D — infer from the product type and dimensions), ` +
              `"placement" (where/how it is used or displayed, e.g. "indoor wall, garden, garage" or "worn on head" — infer from the product), ` +
              `"niche" (target audience / gift niche, e.g. "dog dads", "mechanics", "home decor lovers" — infer from the design theme), ` +
              `"imageUrl" (the MAIN product image URL — use the og:image above if present, else "" ), ` +
              `Fill EVERY field with a useful value — estimate from the product type when the page does not state it — do not leave any field blank except imageUrl. ` +
              `features must be 3-6 short bullet strings. ` +
              `Only the product NAME/identity must come from the page — never invent a DIFFERENT product.` +
              outputLanguageLine(),
          },
        ],
      },
    ],
  }
  const info = parseJsonLoose(await callTextBody(body))
  // og:image do backend parse ra là nguồn đáng tin hơn URL model tự chép lại.
  if (!info.imageUrl && page.ogImage) info.imageUrl = page.ogImage
  return info
}

// Chỉ lấy URL ảnh chính. Backend đã parse og:image nên thường không cần gọi
// model chút nào — chỉ hỏi model khi trang không khai og:image.
export async function extractImageUrlFromUrl(url) {
  const page = await apiFetchPage(url)
  if (page.ogImage) return page.ogImage
  if (page.thin) return ''

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Below is the extracted content of an e-commerce product page at ${page.url}.
` +
              `Find the MAIN product image URL mentioned in it.
` +
              `PAGE TEXT:
"""
${page.text.slice(0, 8000)}
"""
` +
              `Output just the raw absolute URL on one line — no markdown, no quotes, no extra words. ` +
              `If there is no usable product image URL, output an empty line.`,
          },
        ],
      },
    ],
  }
  const text = (await callTextBody(body)).trim()
  const m = text.match(/https?:\/\/[^\s"'`)\]]+/)
  return m ? m[0] : ''
}

// Read product info from an uploaded image.
export async function extractInfoFromImage({ mimeType, base64 }) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64 } },
          {
            text:
              `This is a product image. Return a JSON object ONLY (no markdown) with keys: ` +
              `"name", "category" (core product type), "features" (3-6 short strings), "description" (1-2 sentences), ` +
              `"designTheme" (the visual design theme of the artwork on the product — motifs, style, message), ` +
              `"dimensions" (a typical real-world size for this product type, e.g. "18x12 in"), ` +
              `"material" (surface/material — what you see, or the typical material for this product type), ` +
              `"production" (typical production/print method for this product type, e.g. "UV printed", "sublimation", "embroidered"), ` +
              `"orientation" (landscape / portrait / square / 3D — from the shape you see), ` +
              `"placement" (where/how it is used or displayed — inferred), ` +
              `"niche" (target audience / gift niche — inferred from the design). ` +
              `Fill EVERY field with a useful value (estimate from the product type where needed); do not leave fields blank.`,
          },
        ],
      },
    ],
  }
  return parseJsonLoose(await callTextBody(body))
}

// Read product info from a free-form blob pasted from internal notes (doc / sheet / chat),
// written in Vietnamese. The team supplies: công năng (functions/uses), mục đích
// (purpose), and target audience — plus whatever else is in the note. We break it
// down into the SAME shape as the URL/image extractors so the rest of the mockup
// pipeline is untouched. No auth, no scraping — the user just Ctrl+C/Ctrl+V.
export async function extractInfoFromText(text) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Below is product information copied from an internal note ` +
              `(doc, base row, or chat), written in Vietnamese. It typically states the ` +
              `product's công năng (functions / what it does), mục đích (purpose / why people buy it), ` +
              `and target audience (đối tượng khách hàng). Extract ONLY real data from it — ` +
              `never invent a different product.\n\n` +
              `PASTED TEXT:\n"""\n${text}\n"""\n\n` +
              `Return a JSON object ONLY (no markdown) with keys: ` +
              `"name" (product name if stated, else a concise name for what it is), ` +
              `"category" (the core product type), ` +
              `"features" (3-6 short strings — draw these from the công năng / functions), ` +
              `"description" (1-3 sentences combining what it does + its mục đích / purpose), ` +
              `"designTheme" (visual design theme of the artwork/style if mentioned, else infer from the product), ` +
              `"dimensions" (physical size if stated, otherwise a typical real-world size for this product type, e.g. "18x12 in"), ` +
              `"material" (material / finish if stated, otherwise typical for this product type), ` +
              `"production" (production/print method if stated, otherwise typical for this product type), ` +
              `"orientation" (one of: landscape, portrait, square, or 3D — infer from the product type), ` +
              `"placement" (where/how it is used or displayed — take from the công năng / mục đích, e.g. "worn daily outdoors", "on a kitchen counter", "hung in the living room"), ` +
              `"niche" (the TARGET AUDIENCE stated in the text — keep it faithful, e.g. "dog moms", "gym goers", "new parents"). ` +
              `Fill EVERY field with a useful value — estimate from the product type when the text does not state it — do not leave any field blank. ` +
              `features must be 3-6 short bullet strings.` +
              outputLanguageLine(),
          },
        ],
      },
    ],
  }
  return parseJsonLoose(await callTextBody(body))
}

// Write a base image-generation prompt from product content.
export async function generateBasePrompt(content, brief) {
  const physical = [
    brief?.dimensions && `size ${brief.dimensions}`,
    brief?.material && `material ${brief.material}`,
    brief?.production && `made via ${brief.production}`,
  ]
    .filter(Boolean)
    .join(', ')

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Write ONE detailed product photography / mockup prompt (max 80 words) for an AI image model. ` +
              `Product: ${content.name || ''}. Category: ${content.category || ''}. ` +
              `Features: ${(content.features || []).join(', ')}. Description: ${content.description || ''}. ` +
              (content.designTheme ? `Design theme: ${content.designTheme}. ` : '') +
              (physical ? `Physical: ${physical} — reflect true proportions and material. ` : '') +
              `The image should contain NO text. ` +
              `Focus on the product as the hero. Do NOT mention background or camera angle (those are added later). ` +
              `Return only the prompt text, no quotes, no markdown.`,
          },
        ],
      },
    ],
  }
  return await callTextBody(body)
}

// Convert numeric dimensions into a familiar-object comparison + anchor
// objects. Image models don't do arithmetic on "18x12 in" — they pattern-match
// against objects they know, so we translate the size into that language once
// per run and inject it into every scene/image prompt.
export async function generateSizeComparison(content, brief) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Product: ${content.name || ''} (${content.category || ''}). ` +
              `Real-world size: ${brief.dimensions}. Material: ${brief.material || '(unknown)'}. ` +
              `Typical placement: ${brief.placement || '(unknown)'}.\n\n` +
              `1) "comparison": ONE short English phrase translating this exact size into familiar everyday ` +
              `objects (e.g. "about as wide as two sheets of letter paper side by side", ` +
              `"roughly the height of a soda can", "spans about half the width of a single door"). ` +
              `Be faithful to the stated dimensions — do not exaggerate.\n` +
              `2) "anchors": 3 objects with universally known size that would NATURALLY appear near this ` +
              `product in a marketing photo and instantly communicate its scale ` +
              `(e.g. "an adult hand", "a coffee mug", "a wooden chair", "a standard door", "a person standing"). ` +
              `For SMALL products pick anchors that are LARGER than the product (a hand, a mug, a branch).\n` +
              `3) "sizeClass": exactly one of "tiny" (fits in a palm, <10cm), "small" (10-25cm), ` +
              `"medium" (25-60cm), "large" (>60cm).\n` +
              `4) "relation": ONE blunt English sentence stating the product's size RELATIVE to the first anchor, ` +
              `phrased as a hard constraint (e.g. "The ornament is smaller than the hand holding it", ` +
              `"The sign is about as wide as the chair next to it").\n\n` +
              `Return a JSON object ONLY (no markdown): ` +
              `{"comparison": "...", "anchors": ["...", "...", "..."], "sizeClass": "...", "relation": "..."}`,
          },
        ],
      },
    ],
  }
  const j = parseJsonLoose(await callTextBody(body))
  const cls = String(j.sizeClass || '').toLowerCase()
  return {
    comparison: typeof j.comparison === 'string' ? j.comparison.trim() : '',
    anchors: Array.isArray(j.anchors) ? j.anchors.map((a) => String(a).trim()).filter(Boolean) : [],
    sizeClass: ['tiny', 'small', 'medium', 'large'].includes(cls) ? cls : '',
    relation: typeof j.relation === 'string' ? j.relation.trim() : '',
  }
}

const SMALL_CLASSES = ['tiny', 'small']

// Build a short factual line about the product's physical nature for prompts.
function briefLine(brief) {
  if (!brief) return ''
  const bits = []
  if (brief.material) bits.push(`made of ${brief.material}`)
  if (brief.production) bits.push(`produced via ${brief.production}`)
  if (brief.orientation && brief.orientation.toLowerCase() !== '3d') bits.push(`${brief.orientation} orientation`)
  if (!bits.length) return ''
  return ` The product is ${bits.join(', ')}; render accurate material, surface texture and finish.`
}

// Framing constraint by how much of the frame the product should occupy.
function framingFor(prominence) {
  const p = String(prominence || 'medium').toLowerCase()
  if (p === 'small') return ' Use a wide environmental shot; the product occupies only a small part of the frame (~15-25%).'
  if (p === 'large') return ' Product-focused shot, product occupies a large part of the frame (~55-65%), but still show enough surroundings to read correct scale.'
  return ' Frame it so the product occupies a moderate part of the image (~35-45%) with clear surrounding context.'
}

// THE key line for correct real-world scale — rules depend on the SHOT TYPE:
// a wide shot legitimately shows the product small, a close-up shows it large
// because the camera is near. One global rule killed scene variety; per-shot
// rules keep both variety and correct proportions.
function scaleLine(brief, prominence, sizeCmp, shot) {
  const cmp = sizeCmp?.comparison ? ` — ${sizeCmp.comparison}` : ''
  const size = brief?.dimensions
    ? ` Its true real-world size is ${brief.dimensions}${cmp}.`
    : cmp
      ? ` Its real-world size is${cmp}.`
      : ''
  const rel = sizeCmp?.relation ? ` ${sizeCmp.relation}.` : ''
  const anchor = sizeCmp?.anchors?.[0] || 'a person, a hand or another everyday object'

  if (shot === 'wide') {
    return (
      `${size}${rel} WIDE SHOT: show the surrounding environment at true scale — the product occupies only a ` +
      `small part of the frame, exactly as big as its real size dictates from this distance. Do NOT enlarge it. ` +
      `Keep it the clear focal point through sharp focus, lighting and composition, not through size.`
    )
  }
  if (shot === 'human') {
    return (
      `${size}${rel} The person in the scene is the scale reference: the product's size relative to their ` +
      `hands and body must be physically accurate — never enlarge the product relative to the person. ` +
      `Natural pose and grip for an object of this real size.`
    )
  }
  if (shot === 'close-up' || (!shot && SMALL_CLASSES.includes(sizeCmp?.sizeClass))) {
    return (
      `${size}${rel} CLOSE-UP shot at short camera distance — the product may appear large in frame ONLY ` +
      `because the camera is near, never because the object is big. Include ${anchor} at the SAME distance ` +
      `as the product, and the product must read clearly at its true size next to it. ` +
      `Do NOT scale the product up relative to the anchor.`
    )
  }
  if (shot === 'medium') {
    return (
      `${size}${rel} MEDIUM SHOT: the product sits in its natural spot with anchor objects right beside it — ` +
      `its proportion to those anchors must be physically accurate for its real size. Do NOT enlarge it to ` +
      `fill the frame.`
    )
  }
  return (
    `${size}${rel} Render the product at realistic scale RELATIVE to its surroundings — its proportion to nearby ` +
    `objects, furniture or people must be physically accurate for its real size. Do NOT enlarge the product to ` +
    `fill the frame; keep it correctly proportioned to the environment.${framingFor(prominence)}`
  )
}

// Suggest N marketing scenes tailored to THIS product type + design theme + niche.
// Each scene = where/how the product naturally appears for its target audience —
// not a generic backdrop. Returns an array of "[shot] scene" strings.
export async function suggestScenes(content, niche, count, brief, sizeCmp, lifestyle = false, anglePlan = null) {
  // User đã chọn bộ góc camera → khoá camera theo kế hoạch, model chỉ viết
  // BỐI CẢNH/đạo cụ cho khớp; ta tự ghép "[shot] <góc> — <bối cảnh>" để giữ
  // đúng shot cho scale + đảm bảo góc luôn hiện trong prompt ảnh.
  const focusPhrase = (f) =>
    f === 'design'
      ? 'showcase the ARTWORK / design (motifs, colours, finish) as the star'
      : f === 'function'
        ? 'show the product FULFILLING its real-world function / công năng in use'
        : 'balance BOTH the design and the real-world function'
  const anglePlanLine = anglePlan
    ? `Use EXACTLY these camera setups, one per scene, in this order — do NOT restate the camera in your text, ` +
      `only write the SETTING, context and props that best suit it:\n` +
      anglePlan
        .map((a, i) => `Scene ${i + 1}: camera = ${a.prompt}; emphasis = ${focusPhrase(a.focus)}.`)
        .join('\n') +
      `\n`
    : ''
  const anchorLine = sizeCmp?.anchors?.length
    ? `Each scene MUST include one of these scale-anchor objects near the product: ${sizeCmp.anchors.join(', ')} — `
    : `Each scene should include a natural SCALE REFERENCE (a person, a hand, furniture, or a common everyday object) — `
  const cmpLine = sizeCmp?.comparison ? `Real size reminder: the product is ${sizeCmp.comparison}.\n` : ''
  // Variety WITH correct scale: every scene declares its shot type, and the
  // per-shot scale rules downstream handle how big the product may appear.
  const shotMixLine =
    `For EACH scene choose a SHOT TYPE: ` +
    `"close-up" (camera near, product large in frame, an anchor object at the SAME distance), ` +
    `"medium" (product in its natural spot with anchors right next to it), ` +
    `"wide" (the wider environment visible, product smaller in frame but still the clear focal point), ` +
    `"human" (a person naturally interacting with the product — hanging it, placing it, holding it up, wearing it). ` +
    `MIX the shot types across the ${count} scenes — never give all scenes the same type` +
    (SMALL_CLASSES.includes(sizeCmp?.sizeClass)
      ? `; this is a SMALL product, so include at least one close-up, at least one medium or wide scene showing it ` +
        `hanging/placed in its environment, and one human-interaction scene if natural for this product`
      : '') +
    `. `
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `Propose ${count} DIFFERENT marketing mockup scenes for this product.\n` +
              `Product name: ${content.name || ''}\n` +
              `Product type: ${content.category || ''}\n` +
              `Features: ${(content.features || []).join(', ')}\n` +
              `Design/message: ${content.description || ''}\n` +
              `Design theme: ${content.designTheme || '(infer from the product)'}\n` +
              `Material: ${brief?.material || '(unknown)'}\n` +
              `Typical placement / usage: ${brief?.placement || '(infer from the product)'}\n` +
              `Target niche / audience / purpose: ${niche || '(infer from the product)'}\n` +
              cmpLine +
              `\nEach scene must fit how THIS product type is really used or displayed, reflect the design's ` +
              `theme/message, and appeal to the target audience's world. ` +
              `Examples of the right thinking: a cap → worn by a matching person outdoors, or on a shop shelf; ` +
              `a metal sign → hung on a garage wall, in a garden, or in a man-cave; ` +
              `an ornament → close-up hanging on a branch, a wide shot of the decorated tree where it hangs, ` +
              `a person's hand hanging it on the tree. ` +
              (anglePlan ? anglePlanLine : shotMixLine) +
              (lifestyle
                ? `LIFESTYLE PRIORITY: these are lifestyle mockups. Favour authentic real-life scenes where a ` +
                  `person from the target audience is actually using, wearing, or living with the product in a ` +
                  `genuine everyday environment (home, outdoors, workplace, on-the-go) — real context and props, ` +
                  `natural light. Avoid plain studio backdrops and flat-lays; at most one non-lifestyle scene. `
                : '') +
              anchorLine +
              `so the product's real size reads correctly against its surroundings. ` +
              (anglePlan
                ? `Each scene = SETTING + context + props only (camera is fixed above), ONE line, max 22 words. `
                : `Each scene = setting + context + camera angle, ONE line, max 24 words. `) +
              `Do NOT describe the product itself (it comes from a reference image). Make the ${count} scenes clearly distinct. ` +
              `Return ONLY a JSON array of ${count} objects (no markdown): [{"shot": "close-up|medium|wide|human", "scene": "..."}]`,
          },
        ],
      },
    ],
  }
  const text = await callTextBody(body)
  // Preferred: array of {shot, scene} → serialize to "[shot] scene" so the
  // editable text inputs keep working. Fallback: plain string array.
  const SHOTS = ['close-up', 'medium', 'wide', 'human']
  // Ghép 1 scene: nếu user khoá góc (anglePlan) thì shot + câu góc lấy từ kế
  // hoạch, model chỉ đóng góp bối cảnh; ngược lại giữ hành vi cũ ([shot] từ model).
  const compose = (i, modelShot, sceneText) => {
    const scene = String(sceneText || '').trim()
    if (anglePlan && anglePlan[i]) {
      const a = anglePlan[i]
      return scene ? `[${a.shot}] ${a.prompt} — ${scene}` : `[${a.shot}] ${a.prompt}`
    }
    const shot = SHOTS.includes(String(modelShot || '').toLowerCase()) ? String(modelShot).toLowerCase() : ''
    return shot && scene ? `[${shot}] ${scene}` : scene
  }

  const objs = parseJsonArrayOfObjectsLoose(text)
  if (objs.length) {
    return objs.map((o, i) => compose(i, o.shot, o.scene)).filter(Boolean)
  }
  return parseJsonArrayLoose(text).map((s, i) => compose(i, '', s)).filter(Boolean)
}

// Generate a single image. sceneHint varies background + perspective and may
// carry a "[shot]" tag that selects the per-shot scale rules.
// When a reference image is supplied it is AUTHORITATIVE: the product must be
// kept pixel-faithful and only the scene/camera changes. We deliberately do NOT
// feed the verbose text description of the product here — describing the product
// in words makes the model re-invent it instead of copying the reference.
export async function generateImage(basePrompt, sceneHint, aspectRatio, refImage, brief, prominence, sizeCmp, layoutImage, fixNote, extraRefs = [], matchRef = false) {
  const bLine = briefLine(brief)
  const { shot, text: sceneText } = parseShotTag(sceneHint)
  // fixNote comes from a failed verifyScale pass — the judge's concrete
  // correction, anchored to a visible object, gets top billing in the retry.
  const sLine =
    scaleLine(brief, prominence, sizeCmp, shot) +
    (fixNote ? ` CRITICAL SCALE CORRECTION (a previous attempt failed this): ${fixNote}.` : '')
  // Match-ref mode: hiện ĐÚNG SỐ LƯỢNG đơn vị sản phẩm như trong ảnh ref — ref 3
  // cái → ra 3, ref 1 → ra 1. Không nhân bản thêm, không rút bớt.
  const matchRefLine = matchRef
    ? ` PRODUCT COUNT: render the SAME NUMBER of product units as the reference image shows — if the reference ` +
      `contains three of them, show three; if it shows one, show one. Match their arrangement and spacing; do NOT ` +
      `add, duplicate, remove or omit any unit. Every unit keeps the identical design, artwork, colours and shape ` +
      `from the reference. Keep them at a consistent, physically accurate real-world size in the scene.`
    : ''
  const shotPrefix = shot ? `${shot} shot — ` : ''
  const parts = []
  // Ảnh góc chụp bổ sung: CHÈN SAU cùng và nói rõ vai trò, để không phá thứ tự
  // "ảnh 1 = sản phẩm, ảnh 2 = size guide" mà cả cơ chế ép tỉ lệ đang dựa vào.
  const extras = (extraRefs || []).filter(Boolean)
  const extraLine = extras.length
    ? ` The LAST ${extras.length} reference image(s) are ADDITIONAL VIEWS of the SAME product from other angles — ` +
      `use them ONLY to understand its true shape, depth and details. Do NOT copy their framing, background or size.` +
      (matchRef ? '' : ` Do NOT render several products: the output shows ONE product.`)
    : ''
  const pushExtras = () =>
    extras.forEach((r) => parts.push({ inlineData: { mimeType: r.mimeType, data: r.base64 } }))

  if (refImage && layoutImage) {
    // Dual-reference mode: image 1 = design fidelity, image 2 = size authority.
    // A full-frame product photo alone biases the model toward a big product;
    // the layout canvas shows the intended frame fraction as actual pixels.
    parts.push({ inlineData: { mimeType: refImage.mimeType, data: refImage.base64 } })
    parts.push({ inlineData: { mimeType: layoutImage.mimeType, data: layoutImage.base64 } })
    pushExtras()
    parts.push({
      text:
        `The FIRST reference image shows the EXACT product — reproduce its design, artwork, printed text, ` +
        `colors, shape and proportions completely unchanged; treat it as a fixed asset. ` +
        `The SECOND reference image is the SIZE GUIDE: it shows the exact fraction of the frame the product ` +
        `must occupy in the final image. This size is AUTHORITATIVE — render the product at that size and ` +
        `approximate position, and do NOT make it any larger. Replace the flat gray backdrop with a ` +
        `photorealistic scene built AROUND the product at that size. Scene and camera: ${shotPrefix}${sceneText}.` +
        `${bLine}${sLine} ` +
        `Photorealistic product mockup — design from image 1, size from image 2, both must be respected.${extraLine}`,
    })
  } else if (refImage) {
    parts.push({ inlineData: { mimeType: refImage.mimeType, data: refImage.base64 } })
    pushExtras()
    parts.push({
      text:
        `The reference image shows the EXACT product. Reproduce this product completely unchanged — ` +
        `identical design, artwork, printed text, colors, shape and proportions. ` +
        `Do NOT redraw, restyle, redesign or replace the product; treat it as a fixed asset. ` +
        `Only re-stage it in a new setting. Scene and camera: ${shotPrefix}${sceneText}.${bLine}${sLine}${matchRefLine} ` +
        `Photorealistic product mockup — the product must stay identical to the reference.${extraLine}`,
    })
  } else {
    parts.push({ text: `${basePrompt} Scene and camera: ${shotPrefix}${sceneText}.${bLine}${sLine}${matchRefLine}` })
  }

  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio },
    },
  }
  return await callImageBody(body)
}

// Edit an already-generated mockup in place — used by the per-tile actions
// (change background / shrink / enlarge the product). The current result is
// the reference, so the product rendering itself stays consistent.
export async function editResultImage(image, instruction, aspectRatio) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.base64 } },
          { text: instruction },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio },
    },
  }
  return await callImageBody(body)
}

// ---- Content FB creative ----
// Break a single free-form ad brief into the marketing text layers. Skips any
// layer the brief does not call for. If there is no brief, propose copy from the
// product image itself. Ad copy stays ENGLISH (lower misspelling risk in-image).
export async function breakdownAdBrief(master, baseImage) {
  const parts = []
  if (baseImage?.base64) parts.push({ inlineData: { mimeType: baseImage.mimeType, data: baseImage.base64 } })
  parts.push({
    text:
      `You are a Facebook ad creative director. ` +
      (master && master.trim()
        ? `The user's brief for what to add on top of this product mockup: """${master.trim()}""". `
        : `No brief was given — look at the product image and propose compelling ad copy yourself. `) +
      `Break it into ad text layers and return ONLY compact JSON (no markdown): ` +
      `{"headline":"","text":"","helptext":{"text":"","style":"","location":""}}. ` +
      `headline = the big punchy hook (a few words). text = a short supporting subline. ` +
      `helptext.text = a short CTA / benefit line (the CONTENT), e.g. "Customize your design" or "Order Early". ` +
      `helptext.style = a short description of HOW that helptext should LOOK — badge/box/ribbon/chip shape, ` +
      `colours and font feel (e.g. "red rounded badge, white bold caps" or "orange brush-stroke banner"). ` +
      `helptext.location = where to put it: one of "top-left","top","top-right","bottom-left","bottom","bottom-right" ` +
      `if the brief states a position, otherwise "" (let the tool auto-place it). ` +
      `Infer style from the brief; if the brief does not mention a style, propose a fitting one. ` +
      `IMPORTANT: leave a layer empty ("") if the brief does not call for it — do NOT invent ` +
      `layers that were not requested, UNLESS there was no brief at all (then propose sensible ones). ` +
      `All values in natural, ad-appropriate ENGLISH, no surrounding quotes inside values.`,
  })
  const j = parseJsonLoose(await callTextBody({ contents: [{ role: 'user', parts }] }))
  const hp = j.helptext
  const helptext =
    typeof hp === 'string'
      ? { text: hp.trim(), style: '', location: '' }
      : { text: String(hp?.text || '').trim(), style: String(hp?.style || '').trim(), location: String(hp?.location || '').trim() }
  return {
    headline: typeof j.headline === 'string' ? j.headline.trim() : '',
    text: typeof j.text === 'string' ? j.text.trim() : '',
    helptext,
  }
}

// Compose the ad text layers ON TOP of a finished mockup — the product, scene,
// people and background stay untouched; we only add marketing text. Optional
// refs steer style: `overall` = whole-ad look, `helptext` = the helptext/CTA
// badge look specifically. Refs are learned from, never pixel-copied.
export async function generateAdCreative(baseImage, refs, layers, aspectRatio, variationHint) {
  const { headline, text, helptext } = layers || {}
  const hpText = typeof helptext === 'string' ? helptext : (helptext?.text || '')
  const hpStyle = typeof helptext === 'string' ? '' : (helptext?.style || '')
  const hpLoc = typeof helptext === 'string' ? '' : (helptext?.location || '')
  const overall = refs?.overall?.base64 ? refs.overall : null
  const hpRef = refs?.helptext?.base64 ? refs.helptext : null

  // IMAGE 1 = base. Optional refs get the next image numbers, in order.
  const parts = [{ inlineData: { mimeType: baseImage.mimeType, data: baseImage.base64 } }]
  let n = 1
  let overallIdx = 0
  let hpIdx = 0
  if (overall) { parts.push({ inlineData: { mimeType: overall.mimeType, data: overall.base64 } }); overallIdx = ++n }
  if (hpRef) { parts.push({ inlineData: { mimeType: hpRef.mimeType, data: hpRef.base64 } }); hpIdx = ++n }
  const hasRef = Boolean(overall || hpRef)

  const roleLines = []
  if (overallIdx) roleLines.push(`IMAGE ${overallIdx} is an OVERALL STYLE REFERENCE for the whole ad (fonts, colours, layout mood).`)
  if (hpIdx) roleLines.push(`IMAGE ${hpIdx} is a HELPTEXT REFERENCE — the helptext/CTA badge should look like it (same badge/box shape, colours, typography, position).`)
  // Hai ref có thể mâu thuẫn nhau (ref tổng thể vẽ badge kiểu A, ref helptext
  // kiểu B). Phải nói rõ ai thắng, không thì model tự chọn và mỗi lượt một khác.
  // Helptext ref thắng: nó được đính riêng cho ĐÚNG một khối, tức là chủ ý cụ
  // thể hơn ref tổng thể vốn chỉ nói không khí chung.
  if (overallIdx && hpIdx) {
    roleLines.push(`PRIORITY: IMAGE ${hpIdx} OUTRANKS IMAGE ${overallIdx}. Where the two disagree, follow IMAGE ${hpIdx} for the helptext/CTA badge (its shape, colours, typography and placement), and IMAGE ${overallIdx} for everything else.`)
  }

  const lines = [
    hasRef
      ? `You are given ${parts.length} images. IMAGE 1 is a finished product mockup for a Facebook ad — the real canvas. ${roleLines.join(' ')} Reference images may be low-resolution screenshots; use them ONLY to learn the look.`
      : 'This is a FINISHED product mockup photo for a Facebook ad. Add professional marketing text as an overlay ON TOP of it.',
    `CRITICAL: keep the product, the scene, any people and the background in ${hasRef ? 'IMAGE 1' : 'the photo'} EXACTLY as they already are — do NOT change, move, redraw, restage or re-render anything. Only ADD text and small graphic badges.`,
    'ABSOLUTE RULE — do NOT cover the product: the PRODUCT and its printed design/artwork must stay 100% visible and fully unobstructed. NEVER place any headline, text, helptext, badge or graphic on top of the product, its design, or on people\'s faces. Keep clear breathing room around the product.',
    'Place ALL text ONLY in genuinely EMPTY areas — blank background, sky, plain wall, empty table/floor, or the image corners and margins. If there is not enough empty room, add a solid colour band / panel in an empty zone and put the text inside it — but it must still never overlap the product.',
    hasRef
      ? 'Use the reference image(s) for STYLE ONLY, then RE-CREATE that look FROM SCRATCH directly on IMAGE 1. DO NOT copy, paste, trace, cut out or reuse ANY pixels from the references, and DO NOT inherit their blur, noise, JPEG artifacts or low resolution. Redraw every letter and badge freshly as crisp, sharp, high-resolution vector-clean graphics — the result must be sharper and cleaner than the references.'
      : '',
    'All added text and badges must be perfectly crisp, sharp, high-resolution and cleanly rendered — never blurry, pixelated or low-quality.',
    headline ? `HEADLINE (large, bold, high-impact, scroll-stopping): "${headline}".` : '',
    text ? `Sub-text (smaller, supporting line): "${text}".` : '',
    hpText
      ? `Helptext / CTA: "${hpText}"${hpStyle ? ` — render it in EXACTLY this style: ${hpStyle}` : ''}${hpIdx ? ` — and make it look like IMAGE ${hpIdx}` : ''}${hpLoc && hpLoc !== 'auto' ? ` — POSITION it at the ${hpLoc.replace('-', ' ')} of the image (inside the empty area there)` : ''}. If it needs a badge/box, place it in an empty area, never over the product.`
      : '',
    'Compose with safe margins, strong contrast and clear hierarchy, like a high-converting e-commerce Facebook ad.',
    // Hai chế độ, cố ý loại trừ nhau:
    //   CÓ ref  → ref là luật. Người dùng đã bỏ công đính ảnh mẫu tức là muốn
    //             ra ĐÚNG kiểu đó; ép thêm biến thể bố cục là cãi lại họ.
    //   KHÔNG ref → không có gì để bám, nên đi theo biến thể đa dạng, tránh
    //             sinh N tấm gần như một.
    hasRef
      ? `FOLLOW THE REFERENCE IMAGE(S). Reproduce their typography, colours, badge treatment and overall layout logic as closely as you can on IMAGE 1. Do NOT invent a different composition and do NOT drift toward a generic centred layout.`
      : variationHint
        ? `LAYOUT VARIATION — this render must follow this specific composition, and must NOT look like a generic centred layout: ${variationHint} Always keep the product uncovered.`
        : '',
    `Output aspect ratio ${aspectRatio}.`,
  ]
  parts.push({ text: lines.filter(Boolean).join(' ') })
  const body = {
    contents: [{ role: 'user', parts }],
    generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio } },
  }
  return await callImageBody(body)
}

// Post-generation QA: a vision judge checks whether the product's APPARENT
// size in the generated mockup is physically plausible for its real size.
// Returns {ok, fix} — fix is a one-line corrective instruction for a retry.
export async function verifyScale(image, brief, sizeCmp, shot) {
  const truth = [
    brief?.dimensions && `true size ${brief.dimensions}`,
    sizeCmp?.comparison || '',
    sizeCmp?.relation || '',
  ].filter(Boolean).join('; ')
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: image.mimeType, data: image.base64 } },
          {
            text:
              `This is an AI-generated product mockup${shot ? ` (${shot} shot)` : ''}. ` +
              `The product's REAL size: ${truth}. ` +
              `Judge ONLY the SCALE: compare the product against the people/hands/objects around it in the ` +
              `image. Is its apparent size physically plausible for its real size? ` +
              `The most common failure is the product rendered MUCH LARGER than reality. ` +
              `Be strict about clear violations (product looks 2x+ its real size vs an anchor), ` +
              `lenient about small deviations. ` +
              `Return JSON ONLY (no markdown): {"ok": true/false, ` +
              `"fix": "if not ok — ONE short imperative instruction anchored to a visible object, ` +
              `e.g. 'render the ornament at half the height of the hand holding it'; empty string if ok"}`,
          },
        ],
      },
    ],
  }
  const j = parseJsonLoose(await callTextBody(body))
  return {
    ok: j.ok !== false,
    fix: typeof j.fix === 'string' ? j.fix.trim() : '',
  }
}

/* ===================== Redesign line (nhánh xanh) ===================== */

// Step 1 — pull the flat artwork/design out of a product mockup photo.
// Output: the printed design alone, front-on, on a plain white background,
// with product surface, perspective, lighting and environment removed.
export async function extractDesignFromMockup(mockupImage) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: mockupImage.mimeType, data: mockupImage.base64 } },
          {
            text:
              `This photo shows a product with a printed design/artwork on it. ` +
              `Extract ONLY the printed design as a flat 2D graphic: reproduce the artwork exactly — ` +
              `same illustration, same text, same fonts, same colors, same layout — ` +
              `but viewed perfectly straight-on, with all product surface, perspective distortion, ` +
              `material texture, shadows, reflections and background REMOVED. ` +
              `Place the flat design centered on a plain white background. ` +
              `Do not add, remove, restyle or redraw any part of the design.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1' },
    },
  }
  return await callImageBody(body)
}

// Step 2 — analyze the flat design and list its distinct visual elements.
// Returns [{name, description, box_2d: [ymin, xmin, ymax, xmax] normalized 0-1000}].
// The bounding boxes let the UI crop element thumbnails client-side for free.
export async function extractElementsGemini(designImage) {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: designImage.mimeType, data: designImage.base64 } },
          {
            text:
              `This is a flat 2D print design. Identify its distinct visual ELEMENTS — ` +
              `each separable component a designer would treat as one unit: ` +
              `main illustration/subject, individual text blocks, decorative frames/borders, ` +
              `background pattern/texture, icons, badges. Between 2 and 8 elements. ` +
              `Return ONLY a JSON array (no markdown), one object per element, with keys: ` +
              `"name" (short label, max 5 words), ` +
              `"description" (one sentence: what it is, its style and colors), ` +
              `"box_2d" ([ymin, xmin, ymax, xmax], integers normalized to 0-1000 relative to the image).`,
          },
        ],
      },
    ],
  }
  return normalizeElements(parseJsonArrayOfObjectsLoose(await callTextBody(body)))
}

// Step 3 — produce ONE redesign option. The design image is authoritative for
// everything the user did NOT select; selected elements get reimagined in the
// given art direction. wholeDesign=true reimagines the entire design instead.
export async function redesignImage(designImage, selectedElements, direction, wholeDesign, designTheme) {
  const theme = designTheme ? ` Overall design theme/message to preserve: ${designTheme}.` : ''
  const task = wholeDesign
    ? `Redesign this ENTIRE print design from scratch in a fresh way: keep the same subject matter, ` +
      `message and any text CONTENT (wording), but reimagine composition, illustration style, ` +
      `typography and colors.${theme}`
    : `Redesign ONLY these elements of the design: ` +
      selectedElements.map((e) => `"${e.name}" (${e.description})`).join('; ') +
      `. Reimagine those selected elements in a new style while keeping their meaning and any text wording. ` +
      `Every OTHER part of the design must stay EXACTLY as in the reference — identical artwork, text, ` +
      `colors and layout. Blend the redesigned elements naturally into the untouched parts.${theme}`
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: designImage.mimeType, data: designImage.base64 } },
          {
            text:
              `The reference image is a flat 2D print design. ${task} ` +
              `Art direction for the redesigned parts: ${direction}. ` +
              `Output a flat 2D print design on a plain white background, straight-on view, ` +
              `print-ready look, no product, no photo environment.`,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: '1:1' },
    },
  }
  return await callImageBody(body)
}

/* ===================== parsing helpers ===================== */

function parseJsonLoose(text) {
  if (!text) return {}
  let t = text.trim()
  // strip markdown code fences if present
  t = t.replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1)
  try {
    return JSON.parse(t)
  } catch (_) {
    return { name: '', category: '', features: [], description: text }
  }
}

function parseJsonArrayLoose(text) {
  if (!text) return []
  let t = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1)
  try {
    const arr = JSON.parse(t)
    return Array.isArray(arr) ? arr.map((x) => String(x).trim()).filter(Boolean) : []
  } catch (_) {
    // fallback: split lines, strip bullets/numbering
    return t
      .split('\n')
      .map((l) => l.replace(/^[\s\-*\d.)"]+/, '').replace(/["',]+$/, '').trim())
      .filter(Boolean)
  }
}

export function parseJsonArrayOfObjectsLoose(text) {
  if (!text) return []
  let t = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim()
  const start = t.indexOf('[')
  const end = t.lastIndexOf(']')
  if (start !== -1 && end !== -1) t = t.slice(start, end + 1)
  try {
    const arr = JSON.parse(t)
    return Array.isArray(arr) ? arr.filter((x) => x && typeof x === 'object') : []
  } catch (_) {
    return []
  }
}

// Clamp/validate element objects coming from either provider.
export function normalizeElements(arr) {
  return (arr || [])
    .map((e, i) => {
      let box = Array.isArray(e.box_2d) && e.box_2d.length === 4 ? e.box_2d.map(Number) : null
      if (box && box.some((n) => !Number.isFinite(n))) box = null
      if (box) box = box.map((n) => Math.max(0, Math.min(1000, Math.round(n))))
      // Reject degenerate boxes (zero/negative area) — thumbnail crop would be empty.
      if (box && (box[2] <= box[0] || box[3] <= box[1])) box = null
      return {
        name: String(e.name || `Element ${i + 1}`).trim(),
        description: String(e.description || '').trim(),
        box_2d: box,
      }
    })
    .filter((e) => e.name)
}
