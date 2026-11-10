import { useEffect, useRef, useState } from 'react'
import type { HubLocation } from './api'
import Barcode from './Barcode'
import { locationLink } from './context'
import { LABEL_FORMATS, type LabelFormat } from './nav'
import QrCode from './QrCode'

export type LabelData = Pick<HubLocation, 'locationId' | 'zone' | 'aisle' | 'rack' | 'shelf' | 'bin' | 'profile'>

const FORMATS: Record<LabelFormat, { label: string; hint: string; page: string }> = {
  small: { label: 'Etiqueta 50 × 30 mm', hint: 'Impresora de etiquetas pequeña', page: '50mm 30mm' },
  medium: { label: 'Etiqueta 100 × 50 mm', hint: 'Impresora de etiquetas', page: '100mm 50mm' },
  a4: { label: 'Hoja A4 · 21 por hoja', hint: 'Impresora normal', page: 'A4' },
}

const params = new URLSearchParams(window.location.search)

// Etiquetas de ubicación: QR (abre la ficha en el hub, para el móvil) y Code 128 con el código (para la app móvil de
// almacén de F&O). «Imprimir» abre el diálogo de impresión del navegador: ahí salen las impresoras a las que tienes
// acceso; el tamaño de página va con el formato elegido.
export default function LabelSheet({ company, warehouseId, items, autoPrint = false }: { company: string; warehouseId: string; items: LabelData[]; autoPrint?: boolean }) {
  const [fmt, setFmt] = useState<LabelFormat>(() => LABEL_FORMATS.find((f) => f === params.get('fmt')) ?? 'medium')
  const [barcode, setBarcode] = useState(params.get('bc') !== '0')
  const [copies, setCopies] = useState(1)
  const printed = useRef(false)

  // ?print=1: el diálogo de impresión se abre solo una vez que están pintadas (lo usa el botón QR de F&O).
  useEffect(() => {
    if (!autoPrint || printed.current || items.length === 0) return
    printed.current = true
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [autoPrint, items.length])

  const labels = items.flatMap((l) => Array.from({ length: copies }, (_, i) => ({ l, key: `${l.locationId}|${i}` })))
  const pageCss =
    fmt === 'a4'
      ? '@page { size: A4; margin: 8mm; }'
      : `@page { size: ${FORMATS[fmt].page}; margin: 0; } .hub-lbl { break-after: page; }`

  return (
    <div className="hub-sheet">
      <style>{`@media print { ${pageCss} }`}</style>
      <div className="hub-sheet-tools hub-no-print">
        <div role="radiogroup" aria-label="Formato" className="hub-segmented">
          {LABEL_FORMATS.map((f) => (
            <button key={f} type="button" role="radio" aria-checked={f === fmt} aria-pressed={f === fmt} onClick={() => setFmt(f)} title={FORMATS[f].hint}>
              {FORMATS[f].label}
            </button>
          ))}
        </div>
        <label className="hub-inline-label">
          Copias
          <input type="number" min={1} max={20} value={copies} onChange={(e) => setCopies(Math.min(20, Math.max(1, Number(e.target.value) || 1)))} className="hub-copies" />
        </label>
        <label className="hub-check">
          <input type="checkbox" checked={barcode} onChange={(e) => setBarcode(e.target.checked)} />
          Código de barras para la app móvil
        </label>
        <button type="button" className="hub-button hub-button--primary" onClick={() => window.print()} disabled={labels.length === 0}>
          Imprimir {labels.length === 1 ? '1 etiqueta' : `${labels.length} etiquetas`}
        </button>
      </div>
      <div className={`hub-lbls hub-lbls--${fmt}`}>
        {labels.map(({ l, key }) => (
          <div key={key} className={`hub-lbl hub-lbl--${fmt}`}>
            <div className="hub-lbl-top">
              <QrCode text={locationLink(company, warehouseId, l.locationId)} label={`QR de ${l.locationId}`} className="hub-lbl-qr" />
              <div className="hub-lbl-text">
                <strong>{l.locationId}</strong>
                <span>
                  {[l.aisle && `Pasillo ${l.aisle}`, l.rack > 0 && `rack ${l.rack}`, l.shelf > 0 && `estante ${l.shelf}`, l.bin > 0 && `hueco ${l.bin}`].filter(Boolean).join(' · ') ||
                    l.zone}
                </span>
                <span className="hub-lbl-muted">
                  {company} · {warehouseId}
                  {l.profile ? ` · ${l.profile}` : ''}
                </span>
              </div>
            </div>
            {barcode && <Barcode text={l.locationId} className="hub-lbl-bar" />}
          </div>
        ))}
      </div>
    </div>
  )
}
