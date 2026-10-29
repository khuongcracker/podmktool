// Cờ vẽ bằng SVG, KHÔNG dùng emoji.
// Lý do: Windows không có glyph cho emoji cờ (regional indicator) — 🇻🇳 sẽ hiện
// ra hai chữ "VN" chứ không phải lá cờ. macOS/iOS thì hiện đúng. Vẽ SVG là cách
// duy nhất cho ra kết quả giống nhau trên mọi máy.

export function FlagVN({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 30 21" aria-hidden="true">
      <rect width="30" height="21" fill="#da251d" />
      <path
        fill="#ff0"
        d="M15 4.2l1.76 5.42h5.7l-4.61 3.35 1.76 5.42L15 15.04l-4.61 3.35 1.76-5.42-4.61-3.35h5.7z"
      />
    </svg>
  )
}

export function FlagUK({ size = 20 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id="uk-c">
        <rect width="60" height="30" />
      </clipPath>
      <g clipPath="url(#uk-c)">
        <rect width="60" height="30" fill="#012169" />
        <path d="M0,0 60,30M60,0 0,30" stroke="#fff" strokeWidth="6" />
        <path
          d="M0,0 60,30M60,0 0,30"
          stroke="#c8102e"
          strokeWidth="4"
          clipPath="url(#uk-c)"
        />
        <path d="M30,0 V30 M0,15 H60" stroke="#fff" strokeWidth="10" />
        <path d="M30,0 V30 M0,15 H60" stroke="#c8102e" strokeWidth="6" />
      </g>
    </svg>
  )
}

export const FLAG_BY_CODE = { vi: FlagVN, en: FlagUK }
