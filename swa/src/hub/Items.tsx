import { useEffect, useMemo, useState } from 'react'
import { hubApi, type HubItem, type ItemStock } from './api'
import type { HubCtx } from './context'
import { useAsync, useDebounced, usePaged } from './hooks'
import { num } from './labels'
import MiniPlan from './MiniPlan'
import type { ItemStockFilter } from './nav'
import { ErrorBox, Loading, Pager, Segmented } from './ui'

export default function Items({ ctx }: { ctx: HubCtx }) {
  const { state, navigate, company, warehouseId, compact } = ctx
  const filter = state.itemStock === 'warehouse' && !warehouseId ? 'any' : state.itemStock
  const scope = filter === 'warehouse' ? warehouseId : undefined
  const key = `items|${company}|${filter}|${scope ?? '*'}|${state.q}`
  // La lista va en una columna estrecha: «Ver más» también en PC (las páginas no caben).
  const list = usePaged<HubItem>(key, (skip, top) => hubApi.items(company, scope, filter !== 'all', state.q, skip, top), 0, state.size, true)
  const options: { value: ItemStockFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'any', label: 'Con stock' },
    ...(warehouseId ? [{ value: 'warehouse' as const, label: `En ${warehouseId}` }] : []),
  ]
  const subtitle =
    filter === 'all' ? `Los artículos de ${company}, con su stock en los almacenes WMS.` : filter === 'any' ? `Con stock en los almacenes de ${company}.` : `Con stock en ${scope}.`

  const [text, setText] = useState(state.q)
  const q = useDebounced(text.trim())
  useEffect(() => {
    if (q !== state.q) navigate({ q, page: 0 }, true)
  }, [q, state.q, navigate])

  // En móvil, o la lista o la ficha.
  const showList = !compact || !state.item
  const showDetail = !!state.item

  return (
    <div className="hub-page hub-items">
      {showList && (
        <section aria-label="Artículos" className="hub-items-list">
          <div className="hub-title">
            <h1>Artículos</h1>
            <p className="hub-hint">{subtitle}</p>
          </div>
          <Segmented label="Stock" value={filter} options={options} onChange={(itemStock) => navigate({ itemStock, page: 0 }, true)} />
          <label className="hub-field">
            <span className="hub-sr">Buscar artículo</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar: código o nombre" />
          </label>
          {list.error !== null && <ErrorBox error={list.error} retry={list.retry} />}
          {list.items.length === 0 && list.loading && <Loading />}
          {list.items.length === 0 && !list.loading && list.error === null && (
            <p className="hub-empty">
              {filter === 'all' ? 'Ningún artículo' : 'Ningún artículo con stock'}
              {state.q ? ` que coincida con «${state.q}»` : ''}.
            </p>
          )}
          <ul className="hub-item-buttons">
            {list.items.map((it) => (
              <li key={it.itemId}>
                <button type="button" aria-pressed={it.itemId === state.item} onClick={() => navigate({ item: it.itemId })}>
                  <span>
                    <span className="hub-mono hub-strong">{it.itemId}</span> <span className="hub-strong">{it.name}</span>
                  </span>
                  <span className="hub-hint">
                    {it.locations === 0
                      ? 'Sin stock'
                      : `${num(it.qty)} ${it.unit} · ${it.locations} ${it.locations === 1 ? 'ubicación' : 'ubicaciones'}${it.warehouses > 1 ? ` · ${it.warehouses} almacenes` : ''}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pager
            compact
            page={state.page}
            size={state.size}
            total={list.total}
            shown={list.items.length}
            loading={list.loading}
            onPage={(page) => navigate({ page })}
            onSize={(size) => navigate({ size, page: 0 }, true)}
            onMore={list.more}
          />
        </section>
      )}
      {showDetail ? (
        <Detail ctx={ctx} itemId={state.item!} scope={scope} />
      ) : (
        !compact &&
        list.total > 0 && (
          <section className="hub-card hub-items-detail hub-empty-detail">
            <p className="hub-hint">Elige un artículo para ver dónde está.</p>
          </section>
        )
      )}
    </div>
  )
}

// Campo de F&O vacío: 0, '' o solo guiones (el pasillo «--» de las ubicaciones sin estructura).
function field(v: string | number | undefined): string {
  const s = String(v ?? '').trim()
  return s === '' || s === '0' || /^-+$/.test(s) ? '—' : s
}

function Detail({ ctx, itemId, scope }: { ctx: HubCtx; itemId: string; scope?: string }) {
  const { company } = ctx
  const stock = useAsync(`stock|${company}|${itemId}|${scope ?? '*'}`, () => hubApi.itemStock(company, itemId, scope))
  const s = stock.data

  const byWarehouse = useMemo(() => {
    const m = new Map<string, ItemStock['locations']>()
    for (const l of s?.locations ?? []) m.set(l.warehouseId, [...(m.get(l.warehouseId) ?? []), l])
    return m
  }, [s])
  const warehouses = [...byWarehouse.keys()]
  const [chosen, setChosen] = useState<string | null>(null)
  const planWh = chosen && byWarehouse.has(chosen) ? chosen : ctx.warehouseId && byWarehouse.has(ctx.warehouseId) ? ctx.warehouseId : (warehouses[0] ?? null)
  const layout = useAsync(planWh ? `layout|${company}|${planWh}` : null, () => hubApi.layout(company, planWh!))
  const highlight = useMemo(() => new Set((planWh ? byWarehouse.get(planWh) : undefined)?.map((l) => l.locationId) ?? []), [byWarehouse, planWh])

  return (
    <section aria-label="Detalle del artículo" className="hub-card hub-items-detail">
      {stock.loading && <Loading />}
      {stock.error !== null && <ErrorBox error={stock.error} retry={stock.retry} />}
      {s && (
        <>
          <div className="hub-detail-head">
            <div>
              <span className="hub-mono hub-hint">{s.itemId}</span>
              <h2>{s.name}</h2>
            </div>
            {planWh && layout.data && layout.data.locations.length > 0 && (
              <button type="button" className="hub-button hub-button--primary" onClick={() => ctx.open3d('warehouse', planWh, planWh)}>
                Abrir plano de {planWh} en 3D
              </button>
            )}
          </div>
          <div className="hub-stats">
            <div>
              <span className="hub-hint">Disponible</span>
              <strong>
                {num(s.qty)} {s.unit}
              </strong>
            </div>
            <div>
              <span className="hub-hint">Ubicaciones</span>
              <strong>{new Set(s.locations.map((l) => `${l.warehouseId}|${l.locationId}`)).size}</strong>
            </div>
            <div>
              <span className="hub-hint">Picks pendientes</span>
              <strong>{s.openPicks > 0 ? `${s.openPicks} · ${num(s.openPickQty)} ${s.unit}` : '0'}</strong>
            </div>
          </div>

          {s.locations.length === 0 ? (
            <p className="hub-empty">Sin stock{scope ? ` en ${scope}` : ''}.</p>
          ) : (
            <>
              {warehouses.length > 1 && (
                <div role="group" aria-label="Almacén del plano" className="hub-segmented">
                  {warehouses.map((w) => (
                    <button key={w} type="button" aria-pressed={w === planWh} onClick={() => setChosen(w)}>
                      {w} <span className="hub-hint">{byWarehouse.get(w)!.length}</span>
                    </button>
                  ))}
                </div>
              )}
              <figure className="hub-figure">
                {layout.loading && <Loading>Cargando plano de {planWh}…</Loading>}
                {layout.error !== null && <ErrorBox error={layout.error} retry={layout.retry} />}
                {layout.data && layout.data.locations.length > 0 ? (
                  <MiniPlan layout={layout.data} highlight={highlight} label={`Plano de ${planWh} desde arriba con ${highlight.size} ubicaciones de ${s.name} marcadas`} />
                ) : (
                  layout.data && <p className="hub-hint">{planWh} no tiene plano en F&amp;O.</p>
                )}
                <figcaption className="hub-legend">
                  <span>
                    <i className="hub-swatch hub-swatch--hit" /> Con este artículo
                  </span>
                  <span>
                    <i className="hub-swatch" /> Resto de huecos
                  </span>
                  <span>Desde arriba · {planWh}</span>
                </figcaption>
              </figure>

              {ctx.compact ? (
                <ul className="hub-cards">
                  {s.locations.map((l) => (
                    <li key={`${l.warehouseId}|${l.locationId}|${l.licensePlate ?? ''}|${l.inventoryStatus ?? ''}`}>
                      <button type="button" className="hub-card hub-mcard" onClick={() => ctx.open3d('location', l.locationId, l.warehouseId)}>
                        <span className="hub-mcard-head">
                          <span className="hub-mono hub-strong">{l.locationId}</span>
                          <span className="hub-strong">
                            {num(l.qty)} {s.unit}
                          </span>
                        </span>
                        <span className="hub-hint">
                          {l.warehouseId}
                          {l.fno ? ` · pasillo ${field(l.fno.aisle)} · rack ${field(l.fno.rack)} · estante ${field(l.fno.shelf)} · hueco ${field(l.fno.bin)}` : ''}
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
                        <th scope="col">Almacén</th>
                        <th scope="col">Ubicación</th>
                        <th scope="col">Zona</th>
                        <th scope="col">Pasillo</th>
                        <th scope="col">Rack</th>
                        <th scope="col">Estante</th>
                        <th scope="col">Hueco</th>
                        <th scope="col" className="hub-num">
                          Cantidad
                        </th>
                        <th scope="col">Matrícula</th>
                        <th scope="col">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.locations.map((l) => (
                        <tr key={`${l.warehouseId}|${l.locationId}|${l.licensePlate ?? ''}|${l.inventoryStatus ?? ''}`}>
                          <td>{l.warehouseId}</td>
                          <td>
                            <button type="button" className="hub-link hub-mono" onClick={() => ctx.open3d('location', l.locationId, l.warehouseId)} title="Ver en 3D">
                              {l.locationId}
                            </button>
                          </td>
                          <td>{field(l.fno?.zone)}</td>
                          <td>{field(l.fno?.aisle)}</td>
                          <td>{field(l.fno?.rack)}</td>
                          <td>{field(l.fno?.shelf)}</td>
                          <td>{field(l.fno?.bin)}</td>
                          <td className="hub-num hub-strong">
                            {num(l.qty)} {s.unit}
                          </td>
                          <td className="hub-mono">{l.licensePlate ?? '—'}</td>
                          <td>{l.inventoryStatus ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
