import { hubApi, type LoadWork } from './api'
import type { HubCtx } from './context'
import { useAsync } from './hooks'
import { ErrorBox, Loading } from './ui'
import WorkRow from './WorkRow'

// La carga por dentro: sus pedidos y, en cada uno, sus works con el punto en que van y qué recoger.
export default function LoadDetail({ ctx, loadId, warehouseId }: { ctx: HubCtx; loadId: string; warehouseId: string }) {
  const { company, state } = ctx
  const d = useAsync(`load|${company}|${warehouseId}|${loadId}|${state.cancelled}`, () => hubApi.loadDetail(company, warehouseId, loadId, state.cancelled))
  if (d.loading) return <Loading>Leyendo pedidos de la carga…</Loading>
  if (d.error !== null) return <ErrorBox error={d.error} retry={d.retry} />
  if (!d.data) return null

  const works = d.data.orders.flatMap((o) => o.works)
  const count = (stage: LoadWork['stage']) => works.filter((w) => w.stage === stage).length
  const staged = works.filter((w) => w.stage === 'Staged')
  const summary = [
    count('Picking') > 0 && `${count('Picking')} pendientes de picking`,
    staged.length > 0 && `${staged.length} en ${[...new Set(staged.map((w) => w.stageLocation ?? 'zona intermedia'))].join(', ')}`,
    count('Loaded') > 0 && `${count('Loaded')} cargados`,
    count('Cancelled') > 0 && `${count('Cancelled')} cancelados`,
  ].filter(Boolean)

  return (
    <div className="hub-load-detail">
      <span className="hub-hint">
        {d.data.orders.length} {d.data.orders.length === 1 ? 'pedido' : 'pedidos'} · {works.length} {works.length === 1 ? 'work' : 'works'}: {summary.join(' · ')}
      </span>
      {d.data.orders.map((o) => (
        <section key={o.orderNumber ?? ''} className="hub-load-order" aria-label={o.orderNumber ? `Pedido ${o.orderNumber}` : 'Sin pedido'}>
          <header>
            <strong>
              {o.orderNumber ? (
                <>
                  Pedido <span className="hub-mono">{o.orderNumber}</span>
                </>
              ) : (
                'Sin pedido'
              )}
            </strong>
            <span className="hub-hint">
              {o.works.length} {o.works.length === 1 ? 'work' : 'works'}
            </span>
          </header>
          {o.works.map((w) => (
            <WorkRow key={w.workId} ctx={ctx} work={w} warehouseId={warehouseId} />
          ))}
        </section>
      ))}
    </div>
  )
}
