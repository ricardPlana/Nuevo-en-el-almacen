import { Fragment, useEffect, useState } from 'react'
import { hubApi, type HubOrder } from './api'
import type { HubCtx } from './context'
import { useAsync, useDebounced, usePaged } from './hooks'
import { dayOnly, salesStatus } from './labels'
import { ErrorBox, Loading, Pager, Pill } from './ui'
import WorkRow from './WorkRow'

// Los works del pedido, al abrirlo.
function OrderWorks({ ctx, orderNumber, warehouseId }: { ctx: HubCtx; orderNumber: string; warehouseId: string }) {
  const d = useAsync(`order|${ctx.company}|${warehouseId}|${orderNumber}`, () => hubApi.orderDetail(ctx.company, warehouseId, orderNumber))
  if (d.loading) return <Loading>Leyendo works del pedido…</Loading>
  if (d.error !== null) return <ErrorBox error={d.error} retry={d.retry} />
  if (!d.data) return null
  return (
    <div className="hub-load-order">
      {d.data.works.map((w) => (
        <WorkRow key={w.workId} ctx={ctx} work={w} warehouseId={warehouseId} showLoad />
      ))}
    </div>
  )
}

// Pedidos de venta con algún work abierto o en curso; cada uno se abre dentro de la tabla con sus works.
export default function Orders({ ctx }: { ctx: HubCtx }) {
  const { state, navigate, company, warehouseId, compact } = ctx
  const wh = warehouseId ?? ''
  const key = `orders|${company}|${wh}|${state.q}`
  const list = usePaged<HubOrder>(wh ? key : null, (skip, top) => hubApi.orders(company, wh, state.q, skip, top), state.page, state.size, compact)

  const [text, setText] = useState(state.q)
  const q = useDebounced(text.trim())
  useEffect(() => {
    if (q !== state.q) navigate({ q, page: 0 }, true)
  }, [q, state.q, navigate])

  const isOpen = (o: HubOrder) => state.expanded.includes(o.orderNumber)
  const toggle = (o: HubOrder) => navigate({ expanded: isOpen(o) ? state.expanded.filter((id) => id !== o.orderNumber) : [...state.expanded, o.orderNumber] }, true)
  const inProgress = (o: HubOrder) => (o.inProcess > 0 ? <Pill tone="warn">{o.inProcess} en curso</Pill> : <Pill tone="info">Sin empezar</Pill>)

  return (
    <div className="hub-page">
      <div className="hub-title">
        <h1>Pedidos de venta de {wh}</h1>
        <p className="hub-hint">Los pedidos con works abiertos o en curso en este almacén. Ábrelos para ver sus works y en qué punto van.</p>
      </div>
      <label className="hub-field">
        <span className="hub-sr">Buscar pedido o cliente</span>
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar: pedido o cliente" />
      </label>
      {list.error !== null && <ErrorBox error={list.error} retry={list.retry} />}
      {list.items.length === 0 && list.loading && <Loading />}
      {list.items.length === 0 && !list.loading && list.error === null && <p className="hub-empty">Ningún pedido con works abiertos o en curso{state.q ? ` que coincida con «${state.q}»` : ''} en {wh}.</p>}

      {list.items.length > 0 &&
        (compact ? (
          <ul className="hub-cards">
            {list.items.map((o) => (
              <li key={o.orderNumber} className="hub-card hub-mcard hub-load-card">
                <span className="hub-mcard-head">
                  <span className="hub-mono hub-strong">{o.orderNumber}</span>
                  {inProgress(o)}
                </span>
                <span>{o.customerName ?? o.customerAccount ?? '—'}</span>
                <span className="hub-hint">
                  Envío {dayOnly(o.requestedShipping)} · {o.works} {o.works === 1 ? 'work' : 'works'}
                </span>
                <div className="hub-actions">
                  <button type="button" className="hub-button" aria-expanded={isOpen(o)} onClick={() => toggle(o)}>
                    {isOpen(o) ? 'Ocultar works ▾' : 'Ver works ▸'}
                  </button>
                </div>
                {isOpen(o) && <OrderWorks ctx={ctx} orderNumber={o.orderNumber} warehouseId={wh} />}
              </li>
            ))}
          </ul>
        ) : (
          <div className="hub-table-box">
            <table className="hub-table">
              <thead>
                <tr>
                  <th scope="col" className="hub-chevron-cell">
                    <span className="hub-sr">Abrir</span>
                  </th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Estado del pedido</th>
                  <th scope="col">Envío solicitado</th>
                  <th scope="col" className="hub-num">
                    Works
                  </th>
                  <th scope="col">Avance</th>
                  <th scope="col">Cargas</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((o) => (
                  <Fragment key={o.orderNumber}>
                    <tr className={isOpen(o) ? 'hub-load-open' : undefined}>
                      <td className="hub-chevron-cell">
                        <button
                          type="button"
                          className="hub-chevron"
                          aria-expanded={isOpen(o)}
                          aria-label={`${isOpen(o) ? 'Cerrar' : 'Abrir'} los works del pedido ${o.orderNumber}`}
                          onClick={() => toggle(o)}
                        >
                          <span aria-hidden="true">{isOpen(o) ? '▾' : '▸'}</span>
                        </button>
                      </td>
                      <td className="hub-mono hub-strong">{o.orderNumber}</td>
                      <td>
                        {o.customerName ?? '—'}
                        {o.customerAccount && <span className="hub-hint"> · {o.customerAccount}</span>}
                      </td>
                      <td>{salesStatus(o.status)}</td>
                      <td>{dayOnly(o.requestedShipping)}</td>
                      <td className="hub-num">{o.works}</td>
                      <td>{inProgress(o)}</td>
                      <td className="hub-mono">{o.loads.join(', ') || '—'}</td>
                    </tr>
                    {isOpen(o) && (
                      <tr className="hub-load-detail-row">
                        <td colSpan={8} className="hub-load-cell">
                          <OrderWorks ctx={ctx} orderNumber={o.orderNumber} warehouseId={wh} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        ))}

      <Pager
        compact={compact}
        page={state.page}
        size={state.size}
        total={list.total}
        shown={list.items.length}
        loading={list.loading}
        onPage={(page) => navigate({ page })}
        onSize={(size) => navigate({ size, page: 0 }, true)}
        onMore={list.more}
      />
    </div>
  )
}
