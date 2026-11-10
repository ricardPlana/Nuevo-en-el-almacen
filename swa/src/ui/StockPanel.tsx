import type { Layout, WarehouseStock } from '../types'
import type { StockView } from '../scene/Warehouse3D'
import { theme, type SceneMode } from '../theme'
import { formatQty } from '../format'

type Props = {
  layout: Layout
  stock: WarehouseStock | null
  view: StockView | null
  failed: boolean
  onRetry: () => void
  mode: SceneMode
  query: string
  onQuery: (q: string) => void
  matches: string[]
  onSelect: (locationId: string) => void
}

// Vista de almacén: cifras, leyenda del mapa de calor y buscador de artículo o ubicación.
export default function StockPanel({ layout, stock, view, failed, onRetry, mode, query, onQuery, matches, onSelect }: Props) {
  if (failed) {
    return (
      <section className="card">
        <p className="hint">No he podido cargar el stock del almacén.</p>
        <button className="link-button" onClick={onRetry}>
          Reintentar
        </button>
      </section>
    )
  }
  if (!stock || !view) {
    return (
      <section className="card">
        <p className="hint">Cargando stock…</p>
      </section>
    )
  }

  const puts = new Set(layout.putLocations)
  const storage = layout.locations.filter((l) => !puts.has(l.locationId))
  const filled = storage.filter((l) => (view.byLocation.get(l.locationId)?.qty ?? 0) > 0)
  const units = filled.reduce((s, l) => s + (view.byLocation.get(l.locationId)?.qty ?? 0), 0)
  const picks = stock.locations.flatMap((l) => l.openPicks)
  const works = new Set(picks.map((p) => p.workId))
  const ramp = theme.stock.heat[mode]
  const asOf = new Date(stock.asOf).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

  return (
    <section className="card">
      <header className="card-header">
        <h2>Vista de almacén</h2>
      </header>
      <div className="kpis">
        <div className="kpi">
          <span className="kpi-value">
            {filled.length}
            <small> / {storage.length}</small>
          </span>
          <span className="kpi-label">ubicaciones con stock</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{formatQty(units)}</span>
          <span className="kpi-label">unidades disponibles</span>
        </div>
        <div className="kpi">
          <span className="kpi-value">{works.size}</span>
          <span className="kpi-label">
            {works.size === 1 ? 'work abierto' : 'works abiertos'} · {picks.length} {picks.length === 1 ? 'pick' : 'picks'}
          </span>
        </div>
      </div>

      <div className="legend" aria-label="Leyenda">
        <div className="legend-bar" style={{ background: `linear-gradient(to right, ${ramp.join(', ')})` }} />
        <div className="legend-scale subtle">
          <span>0</span>
          <span>{formatQty(view.maxQty)} uds</span>
        </div>
        <div className="legend-keys subtle">
          <span>
            <span className="legend-ghost" style={{ borderColor: theme.stock.ghost[mode] }} /> vacía
          </span>
          <span>
            <span className="legend-pick" style={{ background: theme.stock.pick }}>
              n
            </span>{' '}
            picks pendientes
          </span>
        </div>
        <p className="subtle legend-note">
          Cantidad disponible en F&amp;O a las {asOf}. Altura y color, relativos a la ubicación más llena.
        </p>
      </div>

      <input
        className="search"
        type="search"
        placeholder="Buscar artículo o ubicación"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        aria-label="Buscar artículo o ubicación"
      />
      {query.trim() && (
        <ul className="work-list">
          {matches.length === 0 && <li className="hint">Nada con «{query.trim()}».</li>}
          {matches.slice(0, 12).map((id) => {
            const s = view.byLocation.get(id)
            return (
              <li key={id}>
                <button onClick={() => onSelect(id)}>
                  <span className="mono">{id}</span>
                  <span className="subtle">{s && s.qty > 0 ? `${formatQty(s.qty)} uds` : 'vacía'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
