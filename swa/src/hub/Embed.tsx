import { useEffect, useState } from 'react'
import type { HubLocation } from './api'
import { viewUrl, type HubCtx } from './context'
import { useCompact } from './hooks'
import { loadLabelLocations } from './labelData'
import LabelSheet from './LabelSheet'
import LocationDetail from './LocationDetail'
import { readState, toSearch, type HubState } from './nav'
import { ErrorBox, Loading } from './ui'

export type EmbedKind = 'location' | 'qr'

// Para meter en un iframe (los botones Información y QR del formulario de ubicaciones de F&O), sin la barra del hub:
//   /hub/?embed=location&company=w3d&warehouseId=CH01&loc=01-A-02-01        la ficha de la ubicación
//   /hub/?embed=qr&company=w3d&warehouseId=CH01&locs=01-A-02-01,01-A-02-02  sus etiquetas; &print=1 abre ya la impresión
export default function Embed({ kind, user }: { kind: EmbedKind; user?: string }) {
  const p = new URLSearchParams(window.location.search)
  const company = (p.get('company') ?? '').toLowerCase()
  const warehouseId = p.get('warehouseId') ?? ''
  const loc = p.get('loc') ?? ''
  const compact = useCompact()

  if (!company || !warehouseId || (kind === 'location' && !loc)) {
    return <div className="hub-status">Faltan la empresa, el almacén o la ubicación en la URL.</div>
  }

  const state = readState()
  const ctx: HubCtx = {
    state,
    compact,
    company,
    companies: [],
    warehouseId,
    warehouses: [],
    // Desde F&O, lo que lleva a otra pantalla del hub se abre en una pestaña nueva; el 3D, en el mismo diálogo.
    navigate: (patch: Partial<HubState>) => window.open(`/hub/${toSearch({ ...state, ...patch, company, warehouseId })}`, '_blank', 'noopener'),
    open3d: (k, id, wh) => window.location.assign(viewUrl(company, k, id, wh, user)),
  }

  return (
    <div className="hub hub-embed">
      {kind === 'location' ? (
        <LocationDetail ctx={ctx} locationId={loc} embedded />
      ) : (
        <EmbedLabels company={company} warehouseId={warehouseId} locs={p.get('locs')?.split(',').filter(Boolean) ?? (loc ? [loc] : [])} autoPrint={p.get('print') === '1'} />
      )}
    </div>
  )
}

function EmbedLabels({ company, warehouseId, locs, autoPrint }: { company: string; warehouseId: string; locs: string[]; autoPrint: boolean }) {
  const [result, setResult] = useState<{ items: HubLocation[]; error: unknown } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const key = locs.join(',')

  useEffect(() => {
    let live = true
    loadLabelLocations(company, warehouseId, key.split(','), { locFilter: 'all', zone: '', aisle: '', profile: '', q: '' }).then(
      (r) => live && setResult({ items: r.items, error: null }),
      (error: unknown) => live && setResult({ items: [], error }),
    )
    return () => {
      live = false
    }
  }, [company, warehouseId, key, attempt])

  if (locs.length === 0) return <div className="hub-status">Elige al menos una ubicación.</div>
  if (!result) return <Loading>Preparando {locs.length === 1 ? 'la etiqueta' : `${locs.length} etiquetas`}…</Loading>
  if (result.error != null) return <ErrorBox error={result.error} retry={() => setAttempt((a) => a + 1)} />
  return <LabelSheet company={company} warehouseId={warehouseId} items={result.items} autoPrint={autoPrint} />
}
