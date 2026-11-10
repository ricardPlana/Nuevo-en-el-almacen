import { useState } from 'react'
import { hubApi, type Match } from './api'
import { recents, type HubCtx } from './context'
import { useAsync, useDebounced } from './hooks'
import { num } from './labels'
import type { View } from './nav'
import { ErrorBox, Icon, type IconName } from './ui'

const KIND_LABEL = { work: 'Work', load: 'Carga', location: 'Ubicación', item: 'Artículo', warehouse: 'Almacén' } as const

export default function Home({ ctx }: { ctx: HubCtx }) {
  const { company, warehouseId, warehouses, navigate } = ctx
  const wh = warehouses.find((w) => w.warehouseId === warehouseId)
  const summary = useAsync(warehouseId ? `sum|${company}|${warehouseId}` : null, () => hubApi.summary(company, warehouseId!))
  const items = useAsync(`items|${company}`, () => hubApi.items(company, undefined, true, '', 0, 1))
  const loads = useAsync(warehouseId ? `loads|${company}|${warehouseId}` : null, () => hubApi.loads(company, warehouseId!, 'open', false, '', 0, 1))
  const me = useAsync(`me|${company}`, () => hubApi.me(company))
  const operators = useAsync(`operators|${company}`, () => hubApi.operators(company))
  const orders = useAsync(warehouseId ? `orders|${company}|${warehouseId}` : null, () => hubApi.orders(company, warehouseId!, '', 0, 1))
  const recent = recents(company).slice(0, 5)

  const go = (view: View) => navigate({ view, page: 0, q: '', item: undefined, loc: undefined, expanded: [] })
  const s = summary.data
  const noPlan = s !== null && s.locations === 0

  return (
    <div className="hub-page">
      <div className="hub-title">
        <h1>¿Qué quieres ver?</h1>
        <p className="hub-hint">
          {company}
          {wh ? ` · ${wh.warehouseId} ${wh.name}` : ''}. Todo se lee de F&amp;O en el momento; desde aquí no se cambia nada.
        </p>
      </div>

      <Search ctx={ctx} />

      {me.data?.map((w) => (
        <button key={w.workId} type="button" className="hub-now" onClick={() => ctx.open3d('work', w.workId, w.warehouseId)}>
          <span className="hub-now-kicker">Tu trabajo ahora</span>
          <span className="hub-now-title">{w.workId}</span>
          <span>
            {w.picks} picks · {num(w.totalDistance)} m{w.firstLocation ? ` · empieza en ${w.firstLocation}` : ''}
          </span>
          <span className="hub-now-cta">Ver mi ruta →</span>
        </button>
      ))}

      <nav aria-label="Secciones" className="hub-tiles">
        <Tile icon="warehouse" title="Almacenes" text="Los almacenes de la empresa con su plano, ocupación y works." stat={String(warehouses.length)} statText={`en ${company}`} onClick={() => go('warehouses')} />
        <Tile
          icon="works"
          title="Trabajos"
          text="Abiertos por defecto; también cerrados y cancelados. Cada uno abre su ruta en 3D."
          stat={s ? String(s.openWorks) : '…'}
          statText={wh ? `abiertos en ${wh.warehouseId}` : 'abiertos'}
          onClick={() => go('works')}
          disabled={!warehouseId}
        />
        <Tile
          icon="order"
          title="Pedidos de venta"
          text="Los pedidos con works abiertos o en curso. Ábrelos para ver sus works y en qué punto van."
          stat={orders.data ? String(orders.data.total) : '…'}
          statText={wh ? `con works abiertos en ${wh.warehouseId}` : 'con works abiertos'}
          onClick={() => go('orders')}
          disabled={!warehouseId}
        />
        <Tile
          icon="items"
          title="Artículos"
          text="Dónde está cada artículo: ubicaciones, cantidades y un mini plano."
          stat={items.data ? String(items.data.total) : '…'}
          statText={`con stock en ${company}`}
          onClick={() => go('items')}
        />
        <Tile
          icon="pin"
          title="Ubicaciones"
          text="Todas las ubicaciones con lo que tienen: vacías, con stock o con picks, por zona, pasillo y perfil."
          stat={s ? num(s.locations) : '…'}
          statText={s ? `${num(s.locationsWithStock)} con stock` : 'ubicaciones'}
          onClick={() => go('locations')}
          disabled={!warehouseId}
        />
        <Tile
          icon="stock"
          title="Ocupación"
          text="Ubicaciones con stock, vacías y con picks, por pasillo y por zona."
          stat={s ? `${s.locations > 0 ? Math.round((s.locationsWithStock / s.locations) * 100) : 0} %` : '…'}
          statText={wh ? `ocupado en ${wh.warehouseId}` : 'ocupado'}
          onClick={() => go('occupancy')}
          disabled={!warehouseId || noPlan}
        />
        <Tile
          icon="user"
          title="Revisión de operarios"
          text="Los picks completados por día, almacén y operario, con el tiempo de cada uno."
          stat={operators.data ? String(operators.data.length) : '…'}
          statText={`usuarios móviles en ${company}`}
          onClick={() => go('operators')}
          disabled={!warehouseId}
        />
        <Tile
          icon="cube"
          title="Vista de almacén"
          text={noPlan ? 'Este almacén no tiene plano en F&O (ni nave ni ubicaciones).' : 'Ocupación y stock en 3D, ubicación a ubicación.'}
          stat={s ? num(s.locationsWithStock) : '…'}
          statText={wh ? `con stock en ${wh.warehouseId}` : 'con stock'}
          onClick={() => warehouseId && ctx.open3d('warehouse', warehouseId, warehouseId)}
          disabled={!warehouseId || noPlan}
        />
        <Tile
          icon="loads"
          title="Cargas"
          text="Las cargas del almacén; cada una abre todas sus rutas, un work por pestaña."
          stat={loads.data ? String(loads.data.total) : '…'}
          statText="con works abiertos"
          onClick={() => go('loads')}
          disabled={!warehouseId}
        />
      </nav>
      {summary.error !== null && <ErrorBox error={summary.error} retry={summary.retry} />}

      {recent.length > 0 && (
        <section className="hub-section">
          <h2>Recientes</h2>
          <ul className="hub-list">
            {recent.map((r) => (
              <li key={`${r.kind}|${r.warehouseId}|${r.id}`}>
                <button type="button" className="hub-row" onClick={() => ctx.open3d(r.kind, r.id, r.warehouseId)}>
                  <span className="hub-row-kind">{KIND_LABEL[r.kind]}</span>
                  <span className="hub-mono">{r.kind === 'warehouse' ? r.warehouseId : r.id}</span>
                  <span className="hub-hint hub-grow">{r.warehouseId}</span>
                  <span className="hub-hint">{ago(r.at)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function Tile({ icon, title, text, stat, statText, onClick, disabled = false }: {
  icon: IconName
  title: string
  text: string
  stat: string
  statText: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button type="button" className="hub-tile" onClick={onClick} disabled={disabled}>
      <span className="hub-tile-icon">
        <Icon name={icon} />
      </span>
      <span className="hub-tile-title">{title}</span>
      <span className="hub-hint">{text}</span>
      <span className="hub-tile-foot">
        <span>
          <strong>{stat}</strong> <span className="hub-hint">{statText}</span>
        </span>
        <span className="hub-tile-cta">Abrir →</span>
      </span>
    </button>
  )
}

// Buscador: lo que se escriba se pregunta a F&O (work, carga, ubicación o artículo) y se abre lo que sea.
function Search({ ctx }: { ctx: HubCtx }) {
  const [text, setText] = useState('')
  const q = useDebounced(text.trim(), 450)
  const found = useAsync(q.length >= 3 ? `resolve|${ctx.company}|${q}` : null, () => hubApi.resolve(ctx.company, q))

  const pick = (m: Match) => {
    if (m.kind === 'item') ctx.navigate({ view: 'items', item: m.id, page: 0, q: '', itemStock: 'all' })
    else ctx.open3d(m.kind, m.id, m.warehouseId ?? ctx.warehouseId ?? '')
  }

  return (
    <form className="hub-search" role="search" onSubmit={(e) => {
      e.preventDefault()
      if (found.data?.length === 1) pick(found.data[0])
    }}>
      <label htmlFor="hub-q" className="hub-search-label">
        <Icon name="pin" size={20} /> Ir a una ubicación, work, carga o artículo
      </label>
      <input id="hub-q" value={text} onChange={(e) => setText(e.target.value)} placeholder="01-A-01-06 · W3D-000006 · W3D-000050 · 100001" autoComplete="off" />
      {q.length >= 3 && found.loading && <p className="hub-hint" role="status">Buscando en F&amp;O…</p>}
      {found.error !== null && <ErrorBox error={found.error} retry={found.retry} />}
      {found.data?.length === 0 && (
        <p className="hub-warn" role="status">
          No encuentro «{q}» en {ctx.company} como work, carga, ubicación ni artículo.
        </p>
      )}
      {found.data && found.data.length > 0 && (
        <ul className="hub-matches">
          {found.data.map((m) => (
            <li key={`${m.kind}|${m.warehouseId}|${m.id}`}>
              <button type="button" onClick={() => pick(m)}>
                <span className="hub-match-text">
                  <span className="hub-hint">{m.label}</span>
                  <span className="hub-mono">{m.id}</span>
                </span>
                <span className="hub-tile-cta">{m.kind === 'work' ? 'Abrir ruta' : m.kind === 'load' ? 'Abrir rutas' : m.kind === 'item' ? 'Ver ubicaciones' : 'Ver en 3D'} →</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}

function ago(at: number): string {
  const min = Math.round((Date.now() - at) / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  return `hace ${Math.round(h / 24)} d`
}
