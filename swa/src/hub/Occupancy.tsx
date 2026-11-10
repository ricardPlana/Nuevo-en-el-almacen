import { useState } from 'react'
import { hubApi, type OccupancyGroup } from './api'
import type { HubCtx } from './context'
import { useAsync } from './hooks'
import { num } from './labels'
import { ErrorBox, Loading, Pill, Segmented } from './ui'

type By = 'aisle' | 'zone'

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0)

// Ocupación del almacén: cada fila es un pasillo (o una zona) con la parte de ubicaciones con stock y la vacía.
// Pulsar una fila abre Ubicaciones con ese filtro.
export default function Occupancy({ ctx }: { ctx: HubCtx }) {
  const { company, warehouseId, navigate } = ctx
  const wh = warehouseId ?? ''
  const occ = useAsync(wh ? `occ|${company}|${wh}` : null, () => hubApi.occupancy(company, wh))
  const [by, setBy] = useState<By>('aisle')
  const o = occ.data
  const rows = o ? (by === 'aisle' ? o.aisles : o.zones) : []

  const open = (g: OccupancyGroup) =>
    navigate({ view: 'locations', locFilter: 'all', q: '', loc: undefined, page: 0, zone: by === 'zone' ? (g.key ?? '') : '', aisle: by === 'aisle' ? (g.key ?? '') : '', profile: '' })

  return (
    <div className="hub-page">
      <div className="hub-title">
        <h1>Ocupación de {wh}</h1>
        <p className="hub-hint">Ubicaciones con disponible físico en F&amp;O y con picks pendientes. Pulsa una fila para ver sus ubicaciones.</p>
      </div>
      {occ.loading && <Loading />}
      {occ.error !== null && <ErrorBox error={occ.error} retry={occ.retry} />}
      {o && (
        <>
          <div className="hub-stats hub-stats--4">
            <div>
              <span className="hub-hint">Ubicaciones</span>
              <strong>{num(o.warehouse.total)}</strong>
            </div>
            <div>
              <span className="hub-hint">Con stock</span>
              <strong>
                {num(o.warehouse.withStock)} <span className="hub-hint">· {pct(o.warehouse.withStock, o.warehouse.total)} %</span>
              </strong>
            </div>
            <div>
              <span className="hub-hint">Vacías</span>
              <strong>{num(o.warehouse.total - o.warehouse.withStock)}</strong>
            </div>
            <div>
              <span className="hub-hint">Con picks pendientes</span>
              <strong>{num(o.warehouse.withPicks)}</strong>
            </div>
          </div>

          <div className="hub-toolbar">
            <Segmented
              label="Agrupar"
              value={by}
              options={[
                { value: 'aisle', label: 'Por pasillo' },
                { value: 'zone', label: 'Por zona' },
              ]}
              onChange={setBy}
            />
            <div className="hub-legend" aria-hidden="true">
              <span>
                <i className="hub-swatch hub-swatch--stock" /> Con stock
              </span>
              <span>
                <i className="hub-swatch" /> Vacías
              </span>
            </div>
          </div>

          <ul className="hub-occ">
            {rows.map((g) => {
              const name = g.key ? (by === 'aisle' ? `Pasillo ${g.key}` : g.key) : by === 'aisle' ? 'Sin pasillo' : 'Sin zona'
              const p = pct(g.withStock, g.total)
              return (
                <li key={g.key ?? '—'}>
                  <button
                    type="button"
                    className="hub-occ-row"
                    onClick={() => open(g)}
                    title={`${name}: ${g.withStock} de ${g.total} con stock (${p} %), ${g.total - g.withStock} vacías, ${g.withPicks} con picks pendientes`}
                  >
                    <span className="hub-occ-name">{name}</span>
                    <span className="hub-occ-bar" aria-hidden="true">
                      {g.withStock > 0 && <span className="hub-occ-stock" style={{ flexGrow: g.withStock }} />}
                      {g.total - g.withStock > 0 && <span className="hub-occ-empty" style={{ flexGrow: g.total - g.withStock }} />}
                    </span>
                    <span className="hub-occ-num">
                      {num(g.withStock)} de {num(g.total)} · {p} %
                    </span>
                    <span className="hub-occ-picks">{g.withPicks > 0 && <Pill tone="warn">{g.withPicks} con picks</Pill>}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
