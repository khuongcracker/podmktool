// Tiny line-art thumbnail illustrating a camera angle. Parametric, not bespoke:
// the product glyph is sized by SHOT (close-up big, wide small) and a small
// camera/eye marker + product skew convey the ANGLE (viz). A corner dot carries
// the focus colour (function / design / both). All 40×40, uniform ratio.
const SHOT_W = { 'close-up': 22, medium: 14, wide: 9, human: 9 }
const FOCUS_COLOR = { function: '#8fa0ee', design: '#6fce9b', both: '#8a8f98' }

// Small filled triangle "camera lens" pointing from (x,y) toward the product,
// dir ∈ up|down|left|right|diag (diag = from top-right).
function Lens({ x, y, dir = 'up' }) {
  const pts = {
    up: `${x},${y - 3} ${x - 2.6},${y + 2} ${x + 2.6},${y + 2}`,
    down: `${x},${y + 3} ${x - 2.6},${y - 2} ${x + 2.6},${y - 2}`,
    left: `${x - 3},${y} ${x + 2},${y - 2.6} ${x + 2},${y + 2.6}`,
    right: `${x + 3},${y} ${x - 2},${y - 2.6} ${x - 2},${y + 2.6}`,
    diag: `${x - 2},${y - 2} ${x + 3},${y - 1} ${x - 1},${y + 3}`,
  }
  return <polygon points={pts[dir]} fill="currentColor" opacity="0.85" />
}

export default function AngleThumb({ viz, shot = 'medium', focus = 'both', size = 40 }) {
  const w = SHOT_W[shot] || 14
  const h = Math.round(w * 0.72)
  const cx = 20
  const cy = 21
  const sw = 1.6
  const P = (props = {}) => (
    <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={2.4} fill="none" stroke="currentColor" strokeWidth={sw} {...props} />
  )
  // Hatch lines to mark a "rear" view.
  const Hatch = () => (
    <g stroke="currentColor" strokeWidth="0.9" opacity="0.6">
      <line x1={cx - w / 2 + 2} y1={cy - h / 2 + 2} x2={cx + w / 2 - 2} y2={cy + h / 2 - 2} />
      <line x1={cx - w / 2 + 2} y1={cy} x2={cx + w / 2 - 2} y2={cy + h / 2 - 2} />
    </g>
  )

  let inner
  switch (viz) {
    case 'front':
      inner = (<>{P()}<Lens x={cx} y={cy + h / 2 + 5} dir="up" /></>)
      break
    case 'front34':
      // skewed to imply a 3/4 turn
      inner = (<><g transform={`skewX(-16) translate(${cx * 0.16 * 1},0)`} style={{ transformOrigin: `${cx}px ${cy}px` }}>{P()}</g><Lens x={cx + 8} y={cy + h / 2 + 5} dir="up" /></>)
      break
    case 'back34':
      inner = (<><g transform="skewX(-16)" style={{ transformOrigin: `${cx}px ${cy}px` }}>{P()}<Hatch /></g></>)
      break
    case 'low':
      inner = (<>{P({ y: cy - h / 2 + 2 })}<Lens x={cx} y={35} dir="up" /></>)
      break
    case 'high':
      inner = (<>{P({ width: w - 2, x: cx - (w - 2) / 2 })}<Lens x={31} y={9} dir="diag" /></>)
      break
    case 'top':
      // seen from directly above: a flatter rect + arrow straight down
      inner = (<><rect x={cx - w / 2} y={cy - (h - 3) / 2} width={w} height={h - 3} rx={2} fill="none" stroke="currentColor" strokeWidth={sw} /><Lens x={cx} y={7} dir="down" /></>)
      break
    // macro và crop TỪNG dùng chung một hình. Hai góc này lại cùng focus
    // 'design' nên chấm góc cũng cùng màu → hai ô y hệt nhau. Còn nhãn chữ thì
    // đoán được, nhưng khi xếp thành lưới icon thì không phân biệt nổi.
    // macro = vân chất liệu · crop = ngoặc cắt cúp.
    case 'macro':
      inner = (
        <>
          <rect x={7} y={8} width={30} height={28} rx={3} fill="none" stroke="currentColor" strokeWidth={sw} />
          <g stroke="currentColor" strokeWidth="1.2" opacity="0.75" strokeLinecap="round">
            <line x1={12} y1={27} x2={20} y2={19} />
            <line x1={18} y1={29} x2={28} y2={19} />
            <line x1={25} y1={30} x2={32} y2={23} />
          </g>
        </>
      )
      break
    case 'crop':
      inner = (
        <>
          <rect x={7} y={8} width={30} height={28} rx={3} fill="none" stroke="currentColor" strokeWidth={sw} opacity="0.45" />
          <g stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round">
            <path d="M13 17v-3h3" /><path d="M31 17v-3h-3" /><path d="M13 27v3h3" /><path d="M31 27v3h-3" />
          </g>
        </>
      )
      break
    case 'closeup':
      inner = (<>{P()}<Lens x={cx} y={cy + h / 2 + 4} dir="up" /></>)
      break
    case 'env':
      inner = (<><line x1={6} y1={26} x2={34} y2={26} stroke="currentColor" strokeWidth="1" opacity="0.5" /><rect x={cx - w / 2} y={26 - h} width={w} height={h} rx={1.6} fill="none" stroke="currentColor" strokeWidth={sw} /></>)
      break
    case 'human':
      // stick figure beside a small product
      inner = (<><g stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round"><circle cx={14} cy={13} r={2.4} /><line x1={14} y1={15.4} x2={14} y2={24} /><line x1={14} y1={18} x2={19} y2={21} /><line x1={14} y1={18} x2={10} y2={21} /><line x1={14} y1={24} x2={11} y2={30} /><line x1={14} y1={24} x2={17} y2={30} /></g><rect x={20} y={19} width={9} height={7} rx={1.6} fill="none" stroke="currentColor" strokeWidth={sw} /></>)
      break
    case 'pov':
      // eye + product ahead
      inner = (<><g stroke="currentColor" strokeWidth="1.3" fill="none"><path d="M6 30 q6 -7 12 0" /><circle cx={12} cy={28} r={1.6} fill="currentColor" stroke="none" /></g><rect x={20} y={12} width={11} height={9} rx={2} fill="none" stroke="currentColor" strokeWidth={sw} /></>)
      break
    case 'side':
      // thin profile + camera from the left
      inner = (<><rect x={cx - 3} y={cy - h / 2 - 2} width={6} height={h + 4} rx={2} fill="none" stroke="currentColor" strokeWidth={sw} /><Lens x={7} y={cy} dir="right" /></>)
      break
    case 'back':
      inner = (<>{P()}<Hatch /></>)
      break
    case 'tilt':
      inner = (<g transform={`rotate(-16 ${cx} ${cy})`}>{P()}<Lens x={cx} y={cy + h / 2 + 5} dir="up" /></g>)
      break
    case 'spot':
      inner = (<><line x1={8} y1={28} x2={32} y2={28} stroke="currentColor" strokeWidth="1.2" opacity="0.55" /><rect x={cx - w / 2} y={28 - h} width={w} height={h} rx={1.6} fill="none" stroke="currentColor" strokeWidth={sw} /></>)
      break
    default:
      inner = P()
  }

  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <rect x={2.5} y={2.5} width={35} height={35} rx={5} fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      {inner}
      <circle cx={33} cy={7} r={2.4} fill={FOCUS_COLOR[focus] || FOCUS_COLOR.both} />
    </svg>
  )
}
