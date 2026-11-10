import { useEffect, useState } from 'react'
import { listWorks } from '../api/client'
import type { WorkStatusFilter, WorkSummary } from '../types'

type Props = {
  warehouseId: string
  reload?: number // sube con el botón ↻: vuelve a pedir la lista
  selectedWorkId: string | null
  onPick: (workId: string) => void
}

const STATUS: Record<string, string> = { Open: 'Abierto', InProcess: 'En curso', Closed: 'Cerrado', Cancelled: 'Cancelado' }

// Histórico: works de venta del almacén, abiertos o cerrados, para abrir cualquiera en el 3D.
export default function WorksPanel({ warehouseId, reload = 0, selectedWorkId, onPick }: Props) {
  const [filter, setFilter] = useState<WorkStatusFilter>('open')
  const [works, setWorks] = useState<WorkSummary[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let alive = true
    listWorks(warehouseId, filter).then(
      (w) => alive && setWorks(w),
      () => alive && setError(true),
    )
    return () => {
      alive = false
    }
  }, [warehouseId, filter, reload])

  const pick = (f: WorkStatusFilter) => {
    setWorks(null)
    setError(false)
    setFilter(f)
  }

  return (
    <section className="card works">
      <header className="card-header">
        <h2>Works del almacén</h2>
      </header>
      <div className="tabs small" role="tablist">
        {(['open', 'closed', 'all'] as const).map((f) => (
          <button key={f} role="tab" aria-selected={filter === f} className={filter === f ? 'active' : ''} onClick={() => pick(f)}>
            {f === 'open' ? 'Abiertos' : f === 'closed' ? 'Cerrados' : 'Todos'}
          </button>
        ))}
      </div>
      {error && <p className="hint">No he podido cargar la lista.</p>}
      {!error && !works && <p className="hint">Cargando…</p>}
      {works && works.length === 0 && <p className="hint">No hay works en esta vista.</p>}
      {works && works.length > 0 && (
        <ul className="work-list">
          {works.map((w) => (
            <li key={w.workId}>
              <button className={w.workId === selectedWorkId ? 'active' : ''} onClick={() => onPick(w.workId)}>
                <span className="mono">{w.workId}</span>
                <span className="subtle">
                  {w.loadId ? `${w.loadId} · ` : ''}
                  {STATUS[w.workStatus] ?? w.workStatus}
                  {w.closedAt ? ` · ${new Date(w.closedAt).toLocaleDateString('es-ES')}` : ''}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
