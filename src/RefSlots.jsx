import { IcPlus } from './Icons.jsx'
import { t } from './i18n.js'

// Ba ô ảnh tham chiếu, KHÔNG phân biệt chính/phụ.
//
// Vì sao cần nhiều ảnh: một ảnh nhiều khi không đủ để model hiểu sản phẩm là gì
// (mặt sau, chi tiết, tỉ lệ thật…). Thêm ảnh giúp model dựng lại đúng thay vì
// đoán. Ảnh tham chiếu CHỈ để hiểu sản phẩm, không dùng làm khung hình đầu ra.
//
// Chỉ có MỘT cách thao tác cho mỗi trạng thái ô, không có nút phụ:
//   ô trống  → bấm vào giữa ô là mở hộp chọn file
//   ô có ảnh → bấm để phóng to, rê chuột hiện dấu × để bỏ
// Ảnh từ link store do App tự lấy về, người dùng không phải bấm gì.
//
// Trước đây mỗi ô nhét thêm hai nút bé "Tải / Từ link". Ô đã nhỏ, nút còn nhỏ
// hơn — vừa khó bấm vừa rối. Bỏ hẳn, đổi lấy ô to nhìn được ảnh.
export default function RefSlots({
  images,     // (Array<{dataUrl}|null>)
  busySlot,   // (number|null) ô đang tự lấy ảnh về
  onUpload,   // (i, File)
  onRemove,   // (i)
  onZoom,     // (dataUrl)
}) {
  return (
    <div className="refs">
      {images.map((img, i) => (
        <div className={img ? 'ref-cell filled' : 'ref-cell'} key={i}>
          {img ? (
            <>
              <img src={img.dataUrl} alt={t('ref.label') + ' ' + (i + 1)} onClick={() => onZoom(img.dataUrl)} title={t('ref.zoom')} />
              <button className="ref-x" title={t('ref.remove')} onClick={() => onRemove(i)}>×</button>
            </>
          ) : busySlot === i ? (
            <span className="spin" />
          ) : (
            <label className="ref-drop" title={t('ref.upload')}>
              <IcPlus size={18} />
              <span>{t('ref.upload')}</span>
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) onUpload(i, f)
                  e.target.value = '' // cho chọn lại đúng file vừa bỏ
                }}
              />
            </label>
          )}
        </div>
      ))}
    </div>
  )
}
