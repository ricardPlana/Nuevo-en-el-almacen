import { hubApi, type HubPick } from './api'
import type { HubCtx } from './context'
import { useAsync, usePaged } from './hooks'
import { date, num } from './labels'
import type { PickPeriod } from './nav'
import { ErrorBox, Loading, Pager, Segmented } from './ui'

// Hoy en la hora del navegador (AAAA-MM-DD), que es lo que entiende <input type="date">.
function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PERIODS: { value: PickPeriod; label: string }[] = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Última semana' },
  { value: 'month', label: 'Último mes' },
]
const MAX_PICKS = 5000 // lo que lee la API por consulta

// De las 00:00 del primer día a las 00:00 del siguiente al último, en la hora del navegador: un día, o los últimos
// 7 o 30 contando hoy. En ISO para la API y como texto para enseñarlo.
function range(period: PickPeriod, day: string): { from: string; to: string; text: string } {
  const [y, m, d] = (period === 'day' ? day : today()).split('-').map(Number)
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 1
  const first = new Date(y, m - 1, d - days + 1)
  const short = (x: Date) => x.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' })
  return { from: first.toISOString(), to: new Date(y, m - 1, d + 1).toISOString(), text: `del ${short(first)} al ${short(new Date(y, m - 1, d))}` }
}

function took(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${s} s`
  const min = Math.floor(s / 60)
  return min < 60 ? `${min} min ${s % 60} s` : `${Math.floor(min / 60)} h ${min % 60} min`
}

const who = (p: HubPick) => p.userName ?? p.userId ?? '—'
const what = (p: HubPick) => p.itemName ?? 'Varios artículos'

// Revisión de operarios: los picks que ha completado cada usuario móvil en un periodo y un almacén (usuario de la línea
// del work). Solo lectura.
export default function Operators({ ctx }: { ctx: HubCtx }) {
  const { state, navigate, company, warehouseId, compact } = ctx
  const wh = warehouseId ?? ''
  const day = state.day ?? today()
  const operators = useAsync(`operators|${company}`, () => hubApi.operators(company))
  const period = state.period
  const key = `picks|${company}|${wh}|${period}|${day}|${state.operator}`
  const { from, to, text } = range(period, day)
  // Los totales vienen en cada respuesta: se piden aparte, con la página mínima, para no depender de la página abierta.
  const totals = useAsync(wh ? `totals|${key}` : null, () => hubApi.picks(company, wh, from, to, state.operator, 0, 1))
  const list = usePaged<HubPick>(wh ? key : null, (skip, top) => hubApi.picks(company, wh, from, to, state.operator, skip, top), state.page, state.size, compact)

  return (
    <div className="hub-page">
      <div className="hub-title">
        <h1>Revisión de operarios · {wh}</h1>
        <p className="hub-hint">Los picks completados en la app móvil, con el usuario de cada línea del work. Los más recientes primero.</p>
      </div>

      <div className="hub-toolbar">
        <Segmented label="Periodo" value={period} options={PERIODS} onChange={(p) => navigate({ period: p, page: 0 }, true)} />
        {period === 'day' ? (
          <label className="hub-inline-label">
            Día
            <input type="date" className="hub-date" value={day} max={today()} onChange={(e) => e.target.value && navigate({ day: e.target.value, page: 0 }, true)} />
          </label>
        ) : (
          <span className="hub-hint">{text}</span>
        )}
        <label className="hub-inline-label">
          Operario
          <select value={state.operator} onChange={(e) => navigate({ operator: e.target.value, page: 0 }, true)}>
            <option value="">Todos</option>
            {operators.data?.map((o) => (
              <option key={o.userId} value={o.userId}>
                {o.name ? `${o.name} (${o.userId})` : o.userId}
              </option>
            ))}
          </select>
        </label>
      </div>

      {totals.data && (
        <div className="hub-stats">
          <div>
            <span className="hub-hint">Picks completados</span>
            <strong>{num(totals.data.total)}</strong>
          </div>
          <div>
            <span className="hub-hint">Works</span>
            <strong>{num(totals.data.works)}</strong>
          </div>
          <div>
            <span className="hub-hint">Tiempo en los picks</span>
            <strong>{took(totals.data.seconds)}</strong>
          </div>
        </div>
      )}

      {totals.data && totals.data.total >= MAX_PICKS && <p className="hub-warn">Hay más de {num(MAX_PICKS)} picks en este periodo: salen los más recientes y los totales solo cuentan esos. Filtra por operario o por día.</p>}
      {list.error !== null && <ErrorBox error={list.error} retry={list.retry} />}
      {list.items.length === 0 && list.loading && <Loading />}
      {list.items.length === 0 && !list.loading && list.error === null && <p className="hub-empty">Ningún pick completado {period === 'day' ? 'ese día' : text} con estos filtros.</p>}

      {list.items.length > 0 &&
        (compact ? (
          <ul className="hub-cards">
            {list.items.map((p) => (
              <li key={`${p.workId}|${p.lineNum}`}>
                <button type="button" className="hub-card hub-mcard" onClick={() => ctx.open3d('work', p.workId, wh)}>
                  <span className="hub-mcard-head">
                    <span className="hub-strong">{what(p)}</span>
                    <span className="hub-strong">
                      {num(p.qty)} {p.unit}
                    </span>
                  </span>
                  <span>
                    <span className="hub-mono">{p.locationId}</span> · {who(p)}
                  </span>
                  <span className="hub-mcard-foot">
                    <span className="hub-hint">
                      {date(p.closedAt)} · {took(p.seconds)} · {p.workId}
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
                  <th scope="col">Cierre</th>
                  <th scope="col">Operario</th>
                  <th scope="col">Ubicación</th>
                  <th scope="col">Artículo</th>
                  <th scope="col" className="hub-num">
                    Cantidad
                  </th>
                  <th scope="col" className="hub-num">
                    Tiempo
                  </th>
                  <th scope="col">Work</th>
                  <th scope="col">Pedido</th>
                  <th scope="col">Carga</th>
                </tr>
              </thead>
              <tbody>
                {list.items.map((p) => (
                  <tr key={`${p.workId}|${p.lineNum}`}>
                    <td className="hub-hint">{date(p.closedAt)}</td>
                    <td>{who(p)}</td>
                    <td className="hub-mono">{p.locationId}</td>
                    <td>
                      {p.itemId && <span className="hub-mono">{p.itemId} · </span>}
                      {what(p)}
                    </td>
                    <td className="hub-num hub-strong">
                      {num(p.qty)} {p.unit}
                    </td>
                    <td className="hub-num">{took(p.seconds)}</td>
                    <td>
                      <button type="button" className="hub-link hub-mono" onClick={() => ctx.open3d('work', p.workId, wh)} title="Ver la ruta de este work">
                        {p.workId}
                      </button>
                    </td>
                    <td className="hub-mono">{p.orderNumber ?? '—'}</td>
                    <td className="hub-mono">{p.loadId ?? '—'}</td>
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
