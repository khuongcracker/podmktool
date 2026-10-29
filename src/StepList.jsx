import { t } from './i18n.js'
import { IcCheck, IcBolt, IcPlayFrom } from './Icons.jsx'

// Khung "chế độ Manual" dùng CHUNG cho mọi tab.
//
// Lý do có file này: trước đây mỗi tab tự bịa một kiểu auto/manual (Mockup dùng
// cặp Tùy biến/Combo, Content dùng cặp Auto/Manual) nên user học lại từ đầu ở
// mỗi tab. Giờ mọi tab đổ vào đúng một khung: danh sách bước đánh số, mỗi bước
// tự báo trạng thái và chạy được.
//
// Mỗi bước có ĐÚNG HAI nút, đều là icon:
//   ▸│ chạy tiếp TỪ bước này tới hết   (onRunFrom)
//   ▸  chỉ chạy RIÊNG bước này         (onRunOnly)
// Không nhét nội dung chi tiết vào trong bước — các ô sửa nằm ở panel Content /
// Phối cảnh ngoài cột giữa, nhét vào đây nữa là hai chỗ sửa cùng một thứ.
//
// steps[] = { id, label, hint?, done, busy, disabled?, disabledNote?,
//             onRunFrom?, onRunOnly? }

function Mark({ done, busy }) {
  if (busy) return <span className="step-mark busy"><span className="spin" /></span>
  if (done) return <span className="step-mark done" aria-label={t('step.done')}><IcCheck size={14} /></span>
  return <span className="step-mark idle" aria-hidden="true" />
}

export default function StepList({ steps }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => {
        const off = s.busy || s.disabled
        const note = s.disabled ? s.disabledNote || '' : ''
        return (
          <li key={s.id} className={'step' + (s.done ? ' is-done' : '')}>
            <span className="step-no">{i + 1}</span>
            <span className="step-text">
              <span className="step-label">{s.label}</span>
              {s.hint && <span className="step-hint">{s.hint}</span>}
            </span>
            <Mark done={s.done} busy={s.busy} />
            {s.onRunFrom && (
              <button
                className="ico sm ghost"
                disabled={off}
                title={note || t('step.runFrom')}
                aria-label={note || t('step.runFrom')}
                onClick={s.onRunFrom}
              >
                <IcPlayFrom size={13} />
              </button>
            )}
            {s.onRunOnly && (
              <button
                className="ico sm ghost"
                disabled={off}
                title={note || t('step.runOnly')}
                aria-label={note || t('step.runOnly')}
                onClick={s.onRunOnly}
              >
                <IcBolt size={13} />
              </button>
            )}
          </li>
        )
      })}
    </ol>
  )
}
