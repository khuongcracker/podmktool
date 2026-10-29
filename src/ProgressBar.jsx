// Fixed bottom-center progress bar — the single place users watch any
// running pipeline. percent = number (0-100) for determinate progress,
// null/undefined for an indeterminate sweeping animation.
export default function ProgressBar({ label, percent }) {
  const pct = percent == null ? null : Math.max(0, Math.min(100, Math.round(percent)))
  return (
    <div className="pbar" role="status" aria-live="polite">
      <div className="pbar-top">
        <span className="pbar-label"><span className="spin" />{label}</span>
        {pct != null && <span className="pbar-num">{pct}%</span>}
      </div>
      <div className="pbar-track">
        <div
          className={pct == null ? 'pbar-fill indet' : 'pbar-fill'}
          style={pct == null ? undefined : { width: pct + '%' }}
        />
      </div>
    </div>
  )
}
