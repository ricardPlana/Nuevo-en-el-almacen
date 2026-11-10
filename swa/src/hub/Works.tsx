import { useEffect, useState } from 'react'
import { hubApi, type HubWork, type ListStatus } from './api'
import type { HubCtx } from './context'
import { useDebounced, usePaged } from './hooks'
import { date, orderType, workStatus } from './labels'
import { ErrorBox, Loading, Pager, Pill, Segmented } from './ui'

const STATUS_OPTIONS: { value: ListStatus; label: string }[] = [
  { value: 'open', label: 'Abiertos' },
  { value: 'closed', label: 'Cerrados' },
  { value: 'all', label: 'Todos' },
]

export default function Works({ ctx }: { ctx: HubCtx }) {
  const { state, navigate, company, warehouseId, compact } = ctx
  const wh = warehouseId ?? ''
  const key = `works|${company}|${wh}|${state.status}|${state.cancelled}|${state.q}`
  const list = usePaged<HubWork>(wh ? key : null, (skip, top) => hubApi.works(company, wh, state.status, state.cancelled, state.q, skip, top), state.page, state.size, compact)

  return (
    <div className="hub-page">
      <div className="hub-title">
        <h1>Trabajos de {wh}</h1>
        <p className="hub-hint">Works de todos los tipos, los más recientes primero. Cada uno abre su ruta en 3D.</p>
      </div>
      <ListToolbar ctx={ctx} placeholder="Work, carga o pedido" cancelledLabel="Incluir cancelados" />
      {list.error !== null && <ErrorBox error={list.error} retry={list.retry} />}
      {list.items.length === 0 && list.loading && <Loading />}
      {list.items.length === 0 && !list.loading && list.error === null && <p className="hub-empty">No hay works {emptyText(state.status)} en {wh}.</p>}

      {list.items.length > 0 &&
        (compact ? (
          <ul className="hub-cards">
            {list.items.map((w) => (
              <li key={w.workId}>
                <button type="button" className="hub-card hub-mcard" onClick={() => ctx.open3d('work', w.workId, w.warehouseId)}>
                  <span className="hub-mcard-head">
                    <span className="hub-mono hub-strong">{w.workId}</span>
                    <Pill tone={workStatus(w.status).tone}>{workStatus(w.status).label}</Pill>
                  </span>
                  <span>
                    {orderType(w.orderType)}
                    {w.orderNumber ? ` ${w.orderNumber}` : ''} · {w.lines} {w.lines === 1 ? 'línea' : 'líneas'}
                  </span>
                  <span className="hub-mcard-foot">
                    <span className="hub-hint">
                      {w.loadId ? `Carga ${w.loadId} · ` : ''}
                      {w.lockedBy ? `cogido por ${w.lockedBy.name ?? w.lockedBy.userId}` : 'sin coger'}
                    </span>
                    <span className="hub-tile-cta">Ruta ›</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="hub-table-box">
            <table className="hub-table">
              <thead>
                <tr>
                  <th scope="col">Work</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Carga</th>
                  <th scope="col" className="hub-num">
                    Líneas
                  </th>
                  <th scope="col">{state.status === 'open' ? 'Inicio' : 'Inicio / cierre'}</th>
                  <th scope="col">Cogido por</th>
                  <th scope="col">
                    <span className="hub-sr">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((w) => (
                  <tr key={w.workId}>
                    <td className="hub-mono hub-strong">{w.workId}</td>
                    <td>
                      <Pill tone={workStatus(w.status).tone}>{workStatus(w.status).label}</Pill>
                    </td>
                    <td>{orderType(w.orderType)}</td>
                    <td className="hub-mono">{w.orderNumber ?? '—'}</td>
                    <td>
                      {w.loadId ? (
                        <button type="button" className="hub-link hub-mono" onClick={() => ctx.open3d('load', w.loadId!, w.warehouseId)} title="Ver las rutas de la carga">
                          {w.loadId}
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="hub-num">{w.lines}</td>
                    <td className="hub-hint">
                      {date(w.startedAt)}
                      {w.closedAt ? ` → ${date(w.closedAt)}` : ''}
                    </td>
                    <td>{w.lockedBy ? (w.lockedBy.name ?? w.lockedBy.userId) : <span className="hub-hint">—</span>}</td>
                    <td className="hub-right">
                      <button type="button" className="hub-button hub-button--ghost" onClick={() => ctx.open3d('work', w.workId, w.warehouseId)}>
                        Ver ruta 3D →
                      </button>
                    </td>
                  </tr>
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

function emptyText(status: ListStatus): string {
  return status === 'open' ? 'abiertos' : status === 'closed' ? 'cerrados' : ''
}

// Estado (abiertos / cerrados / todos), «Incluir cancelados» (solo con cerrados o todos) y buscador. Lo comparten Trabajos y Cargas.
export function ListToolbar({ ctx, placeholder, cancelledLabel }: { ctx: HubCtx; placeholder: string; cancelledLabel: string }) {
  const { state, navigate } = ctx
  const [text, setText] = useState(state.q)
  const q = useDebounced(text.trim())
  useEffect(() => {
    if (q !== state.q) navigate({ q, page: 0 }, true)
  }, [q, state.q, navigate])

  return (
    <div className="hub-toolbar">
      <Segmented label="Estado" value={state.status} options={STATUS_OPTIONS} onChange={(status) => navigate({ status, page: 0 })} />
      {state.status !== 'open' && (
        <label className="hub-check">
          <input type="checkbox" checked={state.cancelled} onChange={(e) => navigate({ cancelled: e.target.checked, page: 0 })} />
          {cancelledLabel}
        </label>
      )}
      <label className="hub-field hub-grow">
        <span className="hub-sr">Buscar</span>
        <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Buscar: ${placeholder}`} />
      </label>
    </div>
  )
}
