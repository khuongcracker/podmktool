import { IcClose } from './Icons.jsx'
import { useEffect } from 'react'

// Fullscreen image zoom. Close: Esc, the × button, or clicking the backdrop.
export default function Lightbox({ src, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!src) return null
  return (
    <div className="lb-backdrop" onClick={onClose}>
      <button className="lb-close" onClick={onClose} aria-label="Đóng"><IcClose size={18} /></button>
      <img className="lb-img" src={src} alt="phóng to" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
