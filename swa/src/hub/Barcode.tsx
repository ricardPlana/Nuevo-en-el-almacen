import { useMemo } from 'react'
import { code128Bars, code128Ok } from './code128'

// Code 128 en SVG, negro sobre blanco (con margen). Si el texto no se puede codificar, no pinta nada.
export default function Barcode({ text, className }: { text: string; className?: string }) {
  const code = useMemo(() => (code128Ok(text) ? code128Bars(text) : null), [text])
  if (!code) return null
  return (
    <svg className={className ?? 'hub-barcode'} viewBox={`0 0 ${code.width} 40`} preserveAspectRatio="none" role="img" aria-label={`Código de barras ${text}`} shapeRendering="crispEdges">
      <rect width={code.width} height={40} fill="#fff" />
      {code.bars.map(([x, w]) => (
        <rect key={x} x={x} y={0} width={w} height={40} fill="#000" />
      ))}
    </svg>
  )
}
