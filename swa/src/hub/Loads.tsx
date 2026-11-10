import { Fragment } from 'react'
import { hubApi, type HubLoad } from './api'
import type { HubCtx } from './context'
import { usePaged } from './hooks'
import { loadStatus } from './labels'
import LoadDetail from './LoadDetail'
import { ErrorBox, Loading, Pager, Pill } from './ui'
import { ListToolbar } from './Works'

export default function Loads({ ctx }: { ctx: HubCtx }) {
  const { state, navigate, company, warehouseId, compact } = ctx
  const wh = warehouseId ?? ''
  const key = `loads|${company}|${wh}|${state.status}|${state.cancelled}|${state.q}`
  const list = usePaged<HubLoad>(wh ? key : null, (skip, top) => hubApi.loads(company, wh, state.status, state.cancelled, state.q, skip, top), state.page, state.size, compact)
  const action = (l: HubLoad) => (l.works === 1 ? 'Ver ruta' : `Ver rutas (${l.works})`)
  const isOpen = (l: HubLoad) => state.expanded.includes(l.loadId)
  const toggle = (l: HubLoad) => navigate({ expanded: isOpen(l) ? state.expanded.filter((id) => id !== l.loadId) : [...state.expanded, l.loadId] }, true)
  const chevron = (l: HubLoad) => (
    <button type="button" className="hub-chevron" aria-expanded={isOpen(l)} aria-label={`${isOpen(l) ? 'Cerrar' : 'Abrir'} los pedidos de la carga ${l.loadId}`} onClick={() => toggle(l)}>
      <span aria-hidden="true">{isOpen(l) ? '▾' : '▸'}</span>
    </button>
  )

  return (
    <div className="hub-page">
      <div className="hub-title">
        <h1>Cargas de {wh}</h1>
        <p className="hub-hint">Las cargas con works en este almacén. Ábrelas para ver sus pedidos y works; «Ver rutas» abre el 3D, por pedido.</p>
      </div>
      <ListToolbar ctx={ctx} placeholder="Carga" cancelledLabel="Incluir canceladas" />
      {list.error !== null && <ErrorBox error={list.error} retry={list.retry} />}
      {list.items.length === 0 && list.loading && <Loading />}
      {list.items.length === 0 && !list.loading && list.error === null && <p className="hub-empty">No hay cargas así en {wh}.</p>}

      {list.items.length > 0 &&
        (compact ? (
          <ul className="hub-cards">
            {list.items.map((l) => (
              <li key={l.loadId} className="hub-card hub-mcard hub-load-card">
                <span className="hub-mcard-head">
                  <span className="hub-mono hub-strong">{l.loadId}</span>
                  <Pill tone={loadStatus(l.status, l.loadStatus).tone}>{loadStatus(l.status, l.loadStatus).label}</Pill>
                </span>
                <span className="hub-hint">
                  {l.works} works · {l.openWorks} abiertos
                </span>
                <div className="hub-actions">
                  <button type="button" className="hub-button" aria-expanded={isOpen(l)} onClick={() => toggle(l)}>
                    {isOpen(l) ? 'Ocultar pedidos ▾' : 'Ver pedidos ▸'}
                  </button>
                  <button type="button" className="hub-button hub-button--primary" onClick={() => ctx.open3d('load', l.loadId, l.warehouseId)} disabled={l.status === 'Cancelled'}>
                    {action(l)}
                  </button>
                </div>
                {isOpen(l) && <LoadDetail ctx={ctx} loadId={l.loadId} warehouseId={l.warehouseId} />}
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
                  <th scope="col">Carga</th>
                  <th scope="col">Estado</th>
                  <th scope="col" className="hub-num">
                    Works
                  </th>
                  <th scope="col" className="hub-num">
                    Abiertos
                  </th>
                  <th scope="col">
                    <span className="hub-sr">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((l) => (
                  <Fragment key={l.loadId}>
                    <tr className={isOpen(l) ? 'hub-load-open' : undefined}>
                      <td className="hub-chevron-cell">{chevron(l)}</td>
                      <td className="hub-mono hub-strong">{l.loadId}</td>
                      <td>
                        <Pill tone={loadStatus(l.status, l.loadStatus).tone}>{loadStatus(l.status, l.loadStatus).label}</Pill>
                      </td>
                      <td className="hub-num">{l.works}</td>
                      <td className="hub-num">{l.openWorks}</td>
                      <td className="hub-right">
                        <button type="button" className="hub-button hub-button--ghost" onClick={() => ctx.open3d('load', l.loadId, l.warehouseId)} disabled={l.status === 'Cancelled'}>
                          {action(l)} →
                        </button>
                      </td>
                    </tr>
                    {isOpen(l) && (
                      <tr className="hub-load-detail-row">
                        <td colSpan={6} className="hub-load-cell">
                          <LoadDetail ctx={ctx} loadId={l.loadId} warehouseId={l.warehouseId} />
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
