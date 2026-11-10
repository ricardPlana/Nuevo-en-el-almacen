import { hubApi, type Warehouse } from './api'
import { remember, type HubCtx } from './context'
import { useAsync } from './hooks'
import { num } from './labels'
import MiniPlan from './MiniPlan'
import type { View } from './nav'
import { ErrorBox, Loading, Pill } from './ui'

export default function Warehouses({ ctx }: { ctx: HubCtx }) {
  return (
    <div className="hub-page">
      <div className="hub-title">
        <h1>Almacenes de {ctx.company}</h1>
        <p className="hub-hint">
          {ctx.warehouses.length} {ctx.warehouses.length === 1 ? 'almacén' : 'almacenes'} con gestión avanzada de almacén. El plano sale de la nave, las zonas y
          las ubicaciones de F&amp;O.
        </p>
      </div>
      {ctx.warehouses.map((w) => (
        <Card key={w.warehouseId} ctx={ctx} wh={w} />
      ))}
    </div>
  )
}

function Card({ ctx, wh }: { ctx: HubCtx; wh: Warehouse }) {
  const { company } = ctx
  const s = useAsync(`sum|${company}|${wh.warehouseId}`, () => hubApi.summary(company, wh.warehouseId))
  const hasPlan = (s.data?.locations ?? 0) > 0
  const layout = useAsync(hasPlan ? `layout|${company}|${wh.warehouseId}` : null, () => hubApi.layout(company, wh.warehouseId))
  const current = wh.warehouseId === ctx.warehouseId

  const go = (view: View) => {
    remember(company, wh.warehouseId)
    const reset = wh.warehouseId === ctx.warehouseId ? {} : { zone: '', aisle: '', profile: '' }
    ctx.navigate({ ...reset, warehouseId: wh.warehouseId, view, page: 0, q: '', item: undefined, loc: undefined, itemStock: view === 'items' ? 'warehouse' : ctx.state.itemStock })
  }

  return (
    <article className="hub-card hub-wh">
      <div className="hub-wh-plan">
        {layout.data ? (
          <MiniPlan layout={layout.data} label={`Plano de ${wh.warehouseId} visto desde arriba`} />
        ) : (
          <span className="hub-hint">{s.data && !hasPlan ? 'Sin plano 3D' : 'Cargando plano…'}</span>
        )}
      </div>
      <div className="hub-wh-body">
        <div className="hub-wh-head">
          <h2>
            {wh.warehouseId} · {wh.name}
          </h2>
          {s.data && <Pill tone={hasPlan ? 'ok' : 'muted'}>{hasPlan ? 'Con plano 3D' : 'Sin plano'}</Pill>}
          {current && <Pill tone="info">Elegido</Pill>}
        </div>
        {s.loading && <Loading />}
        {s.error !== null && <ErrorBox error={s.error} retry={s.retry} />}
        {s.data && (
          <dl className="hub-facts">
            {s.data.building && (
              <div>
                <dt>Nave</dt>
                <dd>
                  {num(s.data.building.length)} × {num(s.data.building.width)} m · {s.data.aisles} pasillos
                </dd>
              </div>
            )}
            <div>
              <dt>Ubicaciones</dt>
              <dd>{num(s.data.locations)}</dd>
            </div>
            <div>
              <dt>Con stock</dt>
              <dd>
                {num(s.data.locationsWithStock)} de {num(s.data.locations)}
              </dd>
            </div>
            <div>
              <dt>Ruta en F&amp;O</dt>
              <dd>
                {s.data.sortAlgorithm === 'Optimized' ? 'Optimizada' : 'Rápida'} · {s.data.distanceStrategy === 'StraightLine' ? 'línea recta' : 'manzana'}
              </dd>
            </div>
            {s.data.startLocation && (
              <div>
                <dt>Salida de la ruta</dt>
                <dd>{s.data.startLocation}</dd>
              </div>
            )}
            <div>
              <dt>Works abiertos</dt>
              <dd>{s.data.openWorks}</dd>
            </div>
          </dl>
        )}
        {s.data && !hasPlan && <p className="hub-hint">No tiene nave, zonas ni ubicaciones con coordenadas en F&amp;O: no hay nada que dibujar. Sus works y artículos sí se listan.</p>}
        <div className="hub-actions">
          {hasPlan && (
            <button type="button" className="hub-button hub-button--primary" onClick={() => ctx.open3d('warehouse', wh.warehouseId, wh.warehouseId)}>
              Abrir en 3D
            </button>
          )}
          <button type="button" className="hub-button" onClick={() => go('works')}>
            Trabajos
          </button>
          <button type="button" className="hub-button" onClick={() => go('loads')}>
            Cargas
          </button>
          <button type="button" className="hub-button" onClick={() => go('items')}>
            Artículos
          </button>
          <button type="button" className="hub-button" onClick={() => go('locations')}>
            Ubicaciones
          </button>
        </div>
      </div>
    </article>
  )
}
