import { useCallback, useEffect, useMemo } from 'react'
import { hubApi } from './api'
import { addRecent, openPatch, remember, remembered, type HubCtx } from './context'
import { useAsync, useCompact } from './hooks'
import Home from './Home'
import Items from './Items'
import Loads from './Loads'
import Locations from './Locations'
import { useHubState, type HubState, type OpenKind, type View } from './nav'
import Occupancy from './Occupancy'
import Operators from './Operators'
import Orders from './Orders'
import QrLabels from './QrLabels'
import { ErrorBox, Icon, Loading } from './ui'
import View3D from './View3D'
import Warehouses from './Warehouses'
import Works from './Works'

const TITLES: Record<View, string> = {
  home: 'Almacén 3D',
  warehouses: 'Almacenes',
  works: 'Trabajos',
  loads: 'Cargas',
  items: 'Artículos',
  locations: 'Ubicaciones',
  labels: 'Etiquetas QR',
  occupancy: 'Ocupación',
  operators: 'Revisión de operarios',
  orders: 'Pedidos de venta',
  '3d': 'Vista 3D',
}
// Al cambiar de empresa o de almacén, los filtros de ubicaciones (valores de ese almacén) se vacían.
const RESET = { page: 0, loc: undefined, zone: '', aisle: '', profile: '', expanded: [] }
const OPEN_LABEL: Record<OpenKind, string> = { work: 'Work', load: 'Carga', location: 'Ubicación', warehouse: 'Almacén' }

export default function Hub({ user }: { user?: string }) {
  const [state, navigate, back] = useHubState()
  const compact = useCompact()

  const companies = useAsync('companies', hubApi.companies)
  const company = useMemo(() => {
    const list = companies.data ?? []
    const known = (c?: string) => (c && list.some((x) => x.company === c) ? c : undefined)
    return known(state.company) ?? known(remembered().company) ?? known('w3d') ?? list[0]?.company
  }, [companies.data, state.company])

  const warehouses = useAsync(company ? `wh|${company}` : null, () => hubApi.warehouses(company!))
  const warehouseId = useMemo(() => {
    const list = warehouses.data ?? []
    const known = (w?: string) => (w && list.some((x) => x.warehouseId === w) ? w : undefined)
    return known(state.warehouseId) ?? known(company ? remembered().warehouses[company] : undefined) ?? list[0]?.warehouseId
  }, [warehouses.data, state.warehouseId, company])

  // La empresa y el almacén elegidos quedan en la URL (sin crear un paso más en el historial) y se recuerdan.
  useEffect(() => {
    if (!company || !warehouses.data) return
    if (company !== state.company || (warehouseId && warehouseId !== state.warehouseId)) navigate({ company, warehouseId }, true)
    remember(company, warehouseId)
  }, [company, warehouseId, warehouses.data, state.company, state.warehouseId, navigate])

  const open3d = useCallback(
    (kind: OpenKind, id: string, wh: string) => {
      if (company) addRecent({ kind, id, warehouseId: wh, company })
      navigate(openPatch(state, kind, id, wh))
    },
    [company, navigate, state],
  )

  const home = () => navigate({ view: 'home', page: 0, q: '', item: undefined, open: undefined })
  const ready = company && warehouses.data
  const title = state.view === '3d' && state.open ? `${OPEN_LABEL[state.open.kind]} ${state.open.kind === 'warehouse' ? state.open.warehouseId : state.open.id}` : TITLES[state.view]

  const ctx: HubCtx | null = ready
    ? { state, navigate, compact, company, companies: companies.data ?? [], warehouseId, warehouses: warehouses.data ?? [], open3d }
    : null

  return (
    <div className={`hub${compact ? ' hub--compact' : ''}${state.view === '3d' ? ' hub--3d' : ''}`}>
      <header className="hub-bar">
        <div className="hub-bar-main">
          {state.view === 'home' ? (
            <span className="hub-logo" aria-hidden="true">
              3D
            </span>
          ) : (
            <button type="button" className="hub-back" onClick={back} aria-label="Volver" title="Volver (Alt+←)">
              <Icon name="back" size={20} />
            </button>
          )}
          <nav aria-label="Ruta de navegación" className="hub-crumbs">
            {state.view === 'home' ? (
              <span className="hub-crumb-current">Almacén 3D</span>
            ) : (
              <>
                {!compact && (
                  <>
                    <button type="button" className="hub-link" onClick={home}>
                      Hub
                    </button>
                    <span aria-hidden="true">›</span>
                  </>
                )}
                {state.view === '3d' && state.from && state.from !== 'home' && !compact && (
                  <>
                    <button type="button" className="hub-link" onClick={back}>
                      {TITLES[state.from]}
                    </button>
                    <span aria-hidden="true">›</span>
                  </>
                )}
                {compact ? (
                  <span className="hub-crumb-stack" aria-current="page">
                    <span className="hub-crumb-current">{title}</span>
                    <span className="hub-crumb-context">
                      {company}
                      {warehouseId ? ` · ${warehouseId}` : ''}
                    </span>
                  </span>
                ) : (
                  <span className="hub-crumb-current" aria-current="page">
                    {title}
                  </span>
                )}
              </>
            )}
          </nav>
        </div>
        {/* En el móvil, empresa y almacén solo en el inicio: en las demás pantallas van debajo del título. */}
        {ready && state.view !== '3d' && (!compact || state.view === 'home') && (
          <Context
            state={state}
            company={company}
            warehouseId={warehouseId}
            companies={companies.data ?? []}
            warehouses={warehouses.data ?? []}
            onCompany={(c) => {
              remember(c)
              navigate({ ...RESET, company: c, warehouseId: undefined, item: undefined })
            }}
            onWarehouse={(w) => {
              remember(company, w)
              navigate({ ...RESET, warehouseId: w })
            }}
          />
        )}
      </header>

      <main className="hub-main">
        {companies.error !== null && <ErrorBox error={companies.error} retry={companies.retry} />}
        {warehouses.error !== null && <ErrorBox error={warehouses.error} retry={warehouses.retry} />}
        {companies.data?.length === 0 && <p className="hub-empty">No hay empresas con almacenes de gestión avanzada en F&amp;O.</p>}
        {!ctx && companies.error === null && warehouses.error === null && companies.data?.length !== 0 && <Loading>Leyendo empresas y almacenes de F&amp;O…</Loading>}
        {ctx && state.view === 'home' && <Home ctx={ctx} />}
        {ctx && state.view === 'warehouses' && <Warehouses ctx={ctx} />}
        {ctx && state.view === 'works' && <Works ctx={ctx} />}
        {ctx && state.view === 'loads' && <Loads ctx={ctx} />}
        {ctx && state.view === 'items' && <Items ctx={ctx} />}
        {ctx && state.view === 'locations' && <Locations ctx={ctx} />}
        {ctx && state.view === 'labels' && <QrLabels ctx={ctx} />}
        {ctx && state.view === 'occupancy' && <Occupancy ctx={ctx} />}
        {ctx && state.view === 'operators' && <Operators ctx={ctx} />}
        {ctx && state.view === 'orders' && <Orders ctx={ctx} />}
        {ctx && state.view === '3d' && state.open && <View3D company={ctx.company} kind={state.open.kind} id={state.open.id} warehouseId={state.open.warehouseId} upn={user} mobile={compact} />}
      </main>
    </div>
  )
}

function Context({ state, company, warehouseId, companies, warehouses, onCompany, onWarehouse }: {
  state: HubState
  company: string
  warehouseId?: string
  companies: { company: string; name: string }[]
  warehouses: { warehouseId: string; name: string }[]
  onCompany: (c: string) => void
  onWarehouse: (w: string) => void
}) {
  return (
    <div className="hub-context">
      <label className="hub-inline-label">
        Empresa
        <select value={company} onChange={(e) => onCompany(e.target.value)}>
          {companies.map((c) => (
            <option key={c.company} value={c.company}>
              {c.company} · {c.name}
            </option>
          ))}
        </select>
      </label>
      {state.view !== 'warehouses' && warehouses.length > 0 && (
        <label className="hub-inline-label">
          Almacén
          <select value={warehouseId} onChange={(e) => onWarehouse(e.target.value)}>
            {warehouses.map((w) => (
              <option key={w.warehouseId} value={w.warehouseId}>
                {w.warehouseId} · {w.name}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}
