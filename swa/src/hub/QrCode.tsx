import { useMemo } from 'react'
import { qrMatrix, qrSvgPath } from './qr'

// QR en SVG (negro sobre blanco siempre, también en tema oscuro: si no, los lectores no lo leen).
export default function QrCode({ text, label, className }: { text: string; label: string; className?: string }) {
  const { path, size } = useMemo(() => qrSvgPath(qrMatrix(text)), [text])
  return (
    <svg className={className ?? 'hub-qr'} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  )
}

