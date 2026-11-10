import { useEffect, useState } from 'react'
import type { HubLocation } from './api'
import type { HubCtx } from './context'
import { loadLabelLocations } from './labelData'
import LabelSheet from './LabelSheet'
import { ErrorBox, Loading } from './ui'

// Etiquetas para imprimir: QR (abre la ficha en el hub) y código de barras (app móvil de almacén).
export default function QrLabels({ ctx }: { ctx: HubCtx }) {
  const { state, company, warehouseId } = ctx
  const wh = warehouseId ?? ''
  const { locs, locFilter, zone, aisle, profile, q } = state
  const key = `${company}|${wh}|${locs?.join(',') ?? ''}|${locFilter}|${zone}|${aisle}|${profile}|${q}`
  const [result, setResult] = useState<{ key: string; items: HubLocation[]; total: number; error: unknown } | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!wh) return
    let live = true
    loadLabelLocations(company, wh, locs, { locFilter, zone, aisle, profile, q }).then(
      (r) => live && setResult({ key, ...r, error: null }),
      (error: unknown) => live && setResult({ key, items: [], total: 0, error }),
    )
    return () => {
      live = false
    }
  }, [key, attempt, company, wh, locs, locFilter, zone, aisle, profile, q])

  const fresh = result?.key === key ? result : null
  const filters = locs?.length
    ? [locs.length === 1 ? locs[0] : `${locs.length} ubicaciones elegidas`]
    : [
        locFilter === 'stock' ? 'con stock' : locFilter === 'empty' ? 'vacías' : locFilter === 'picks' ? 'con picks' : null,
        zone && `zona ${zone}`,
        aisle && `pasillo ${aisle}`,
        profile && `perfil ${profile}`,
        q && `«${q}»`,
      ].filter(Boolean)

  return (
    <div className="hub-page hub-labels-page">
      <div className="hub-title hub-no-print">
        <h1>Etiquetas · {wh}</h1>
        <p className="hub-hint">
          QR para el móvil (abre la ficha) y código de barras con el código de la ubicación para la app móvil de almacén.
          {filters.length > 0 ? ` ${filters.join(', ')}.` : ' Todas las ubicaciones.'}
          {fresh && fresh.total > fresh.items.length ? ` Salen ${fresh.items.length} de ${fresh.total}: filtra por pasillo para el resto.` : ''}
        </p>
      </div>
      {!fresh && <Loading>Leyendo ubicaciones…</Loading>}
      {fresh?.error != null && <ErrorBox error={fresh.error} retry={() => setAttempt((a) => a + 1)} />}
      {fresh && fresh.error == null && <LabelSheet company={company} warehouseId={wh} items={fresh.items} />}
    </div>
  )
}
