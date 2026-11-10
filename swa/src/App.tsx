import { useEffect, useMemo, useRef, useState } from 'react'
import { dataSource, FnoUnavailableError, getHealth, getLayout, getLoadRoutes, getRoute, getStock, NotFoundError, UnauthorizedError } from './api/client'
import { firstStep, type Layout, type Route, type WarehouseStock } from './types'
import type { HostInfo } from './host/host'
import Warehouse3D, { type StockView } from './scene/Warehouse3D'
import RouteOverlay from './scene/RouteOverlay'
import ViewActions from './ui/ViewActions'
import LocationPanel from './ui/LocationPanel'
import RoutePanel from './ui/RoutePanel'
import StockPanel from './ui/StockPanel'
import { ErrorState, Loading } from './ui/Status'
import WorksPanel from './ui/WorksPanel'
import { targetFromHash, type Target } from './target'
import './app.css'

const params = new URLSearchParams(window.location.search)
// Almacén por defecto (rutas y ?locationId=). La vista de almacén lo trae en ?warehouseId= o subPageId wh:24.
const DEFAULT_WAREHOUSE = params.get('warehouseId') ?? '24'
// ?present=1: modo sesión (etiquetas grandes, fondo neutro, sin indicadores de desarrollo).
const present = params.get('present') === '1'
// ?mobile=1 (lo pone el hub en el móvil): el 3D arriba a toda la anchura y el panel abajo, plegable. Sin él, como siempre.
const mobile = params.get('mobile') === '1'
// ?scope=load (lo pone el hub al abrir una carga): solo la carga, sin los works de todo el almacén ni el enlace a la
// vista de almacén, que se saldría de ella. Sin él, como siempre.
const onlyLoad = params.get('scope') === 'load'

type Problem = { title: string; detail?: string }

// Los works de una carga, por pedido (?scope=load), con su posición en la lista de rutas.
function byOrder(routes: Route[]): { order?: string; routes: { route: Route; index: number }[] }[] {
  const groups = new Map<string, { order?: string; routes: { route: Route; index: number }[] }>()
  routes.forEach((route, index) => {
    const key = route.orderNumber ?? ''
    if (!groups.has(key)) groups.set(key, { order: route.orderNumber, routes: [] })
    groups.get(key)!.routes.push({ route, index })
  })
  return [...groups.values()]
}

// Mientras llega el stock, el 3D ya pinta las cajas fantasma: así la escena se construye una sola vez.
const EMPTY_STOCK: StockView = { byLocation: new Map(), maxQty: 0 }

export default function App({ host }: { host: HostInfo }) {
  // Lo que se enseña: llega del host (URL / Teams) y se puede cambiar desde el histórico de works.
  const [target, setTarget] = useState<Target>(host.target)
  const [attempt, setAttempt] = useState(0)
  // Solo con ?mobile=1: el panel de abajo, plegado al empezar para que se vea el 3D.
  const [panelOpen, setPanelOpen] = useState(false)
  const [layout, setLayout] = useState<Layout | null>(null)
  const [routes, setRoutes] = useState<Route[]>([])
  const [routeIndex, setRouteIndex] = useState(0)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(target?.kind === 'loc' ? target.id : null)
  const [step, setStep] = useState(0)
  // &play=1 arranca la animación sola (útil embebido en F&O y para grabar la demo).
  const [playing, setPlaying] = useState(() => params.get('play') === '1')
  // "Siguiente": se anda hasta esta parada y se para ahí. null = reproducir hasta el final.
  const [stopAt, setStopAt] = useState<number | null>(null)
  // Vista de almacén (sin objetivo, ?warehouseId= o ?locationId=): stock y picks pendientes, sin rutas.
  const [stock, setStock] = useState<WarehouseStock | null>(null)
  const [stockFailed, setStockFailed] = useState(false)
  const [stockAttempt, setStockAttempt] = useState(0)
  const [query, setQuery] = useState('')
  // Botón ↻: plano leído otra vez de F&O (sin caché) y luego stock, ruta y works. El 3D sigue visible mientras tanto.
  const [reload, setReload] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  // En una ruta, el almacén es el del work: la extensión X++ lo pasa en ?warehouseId= para cargar el plano en paralelo;
  // si no viene, se espera a la ruta.
  const routeTarget = target?.kind === 'work' || target?.kind === 'load'
  const warehouseId =
    target?.kind === 'wh' ? target.id : routeTarget ? (params.get('warehouseId') ?? routes[0]?.warehouseId) : DEFAULT_WAREHOUSE
  const stockMode = !target || target.kind === 'wh' || target.kind === 'loc'

  useEffect(() => {
    if (!warehouseId) return
    getLayout(warehouseId).then(setLayout, (e: unknown) => setProblem(describe(e, `el almacén ${warehouseId}`)))
  }, [warehouseId, attempt])

  // El stock no bloquea: si falla, el 3D sale igual y el panel ofrece reintentar.
  useEffect(() => {
    if (!stockMode || !warehouseId) return
    getStock(warehouseId).then(setStock, () => setStockFailed(true))
  }, [stockMode, warehouseId, attempt, stockAttempt, reload])

  useEffect(() => {
    const show = (rs: Route[]) => {
      setRoutes(rs)
      setStep(firstStep(rs[0]))
    }
    if (target?.kind === 'work') {
      getRoute(target.id).then((r) => show([r]), (e: unknown) => setProblem(describe(e, `el work ${target.id}`)))
    } else if (target?.kind === 'load') {
      getLoadRoutes(target.id).then(show, (e: unknown) => setProblem(describe(e, `la carga ${target.id}`)))
    }
  }, [target, attempt, reload])

  // Detalles del trabajo en F&O: al cambiar de work solo cambia #workId=. Se cambia la ruta sin recargar la página
  // (el plano del almacén y la sesión se quedan). Si cambia el almacén, F&O cambia la query y el iframe se recarga.
  const targetRef = useRef(target)
  useEffect(() => {
    targetRef.current = target
  }, [target])
  useEffect(() => {
    const onHash = () => {
      const next = targetFromHash()
      const cur = targetRef.current
      if (!next || (cur?.kind === next.kind && cur.id === next.id)) return
      setRoutes([])
      setRouteIndex(0)
      setStep(0)
      setPlaying(params.get('play') === '1')
      setStopAt(null)
      setSelectedId(null)
      setProblem(null)
      setTarget(next)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const refresh = () => {
    if (!warehouseId || refreshing) return
    setRefreshing(true)
    getLayout(warehouseId, true)
      .then(
        (l) => {
          setLayout(l)
          setStockFailed(false)
          setReload((r) => r + 1)
        },
        (e: unknown) => setProblem(describe(e, `el almacén ${warehouseId}`)),
      )
      .finally(() => setRefreshing(false))
  }

  const route = routes[routeIndex] ?? null

  // Escala del mapa de calor: solo ubicaciones de almacenaje que están en el 3D.
  const stockView = useMemo<StockView | null>(() => {
    if (!stock || !layout) return null
    const puts = new Set(layout.putLocations)
    const byLocation = new Map(stock.locations.map((l) => [l.locationId, l]))
    const qtys = layout.locations.filter((l) => !puts.has(l.locationId)).map((l) => byLocation.get(l.locationId)?.qty ?? 0)
    return { byLocation, maxQty: Math.max(0, ...qtys) }
  }, [stock, layout])

  // Búsqueda por ubicación, código o nombre de artículo.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !layout) return []
    const puts = new Set(layout.putLocations)
    return layout.locations
      .filter((l) => !puts.has(l.locationId))
      .filter((l) => {
        if (l.locationId.toLowerCase().includes(q)) return true
        const items = stockView?.byLocation.get(l.locationId)?.items ?? []
        return items.some((i) => i.itemId.toLowerCase().includes(q) || i.itemName.toLowerCase().includes(q))
      })
      .map((l) => l.locationId)
  }, [query, layout, stockView])

  const emphasis = useMemo(() => {
    if (route) return new Set(route.lines.map((l) => l.locationId))
    if (stockMode && query.trim()) return new Set(matches)
    return undefined
  }, [route, stockMode, query, matches])

  if (problem) {
    const retry = () => {
      setProblem(null)
      setAttempt((a) => a + 1)
    }
    return <ErrorState title={problem.title} detail={problem.detail} onRetry={retry} />
  }
  const openWork = (workId: string) => {
    setRoutes([])
    setRouteIndex(0)
    setStep(0)
    setPlaying(false)
    setSelectedId(null)
    setTarget({ kind: 'work', id: workId })
    const url = new URL(window.location.href)
    url.searchParams.delete('loadId')
    url.searchParams.delete('locationId')
    url.searchParams.set('workId', workId)
    url.hash = ''
    window.history.replaceState(null, '', url)
  }
  const openWarehouse = () => {
    setRoutes([])
    setRouteIndex(0)
    setPlaying(false)
    setSelectedId(null)
    const wh = warehouseId ?? layout?.warehouseId ?? DEFAULT_WAREHOUSE
    setTarget({ kind: 'wh', id: wh })
    const url = new URL(window.location.href)
    url.searchParams.delete('workId')
    url.searchParams.delete('loadId')
    url.searchParams.delete('locationId')
    url.searchParams.set('warehouseId', wh)
    url.hash = ''
    window.history.replaceState(null, '', url)
  }
  const retryStock = () => {
    setStockFailed(false)
    setStockAttempt((a) => a + 1)
  }

  if (!layout || ((target?.kind === 'work' || target?.kind === 'load') && !route)) {
    return <Loading text={target?.kind === 'work' ? `Cargando la ruta de ${target.id}…` : 'Cargando almacén…'} />
  }

  const selected = layout.locations.find((l) => l.locationId === selectedId) ?? null

  const goTo = (s: number) => {
    setPlaying(false)
    setStep(s)
  }
  const arrive = (s: number) => {
    setStep(s)
    if ((route && s >= route.lines.length) || (stopAt !== null && s >= stopAt)) setPlaying(false)
  }
  const play = () => {
    setStopAt(null)
    setPlaying(true)
  }
  // Paso a paso: anda hasta la parada siguiente y se queda ahí. Con la reproducción en marcha, para en la próxima.
  const next = () => {
    setStopAt(step + 1)
    setPlaying(true)
  }
  const select = (id: string | null) => {
    setSelectedId(id)
    if (mobile && id) setPanelOpen(true)
    const i = route && id ? route.lines.findIndex((l) => l.locationId === id) : -1
    if (i >= 0) goTo(i)
  }
  const pickRoute = (i: number) => {
    setRouteIndex(i)
    goTo(firstStep(routes[i]))
  }

  return (
    <div className={['app', present && 'present', mobile && 'mobile', mobile && !panelOpen && 'panel-closed'].filter(Boolean).join(' ')}>
      <div className="viewport">
        <Warehouse3D
          layout={layout}
          mode={host.theme}
          present={present}
          selectedId={selectedId}
          emphasis={emphasis}
          stock={stockMode ? (stockView ?? EMPTY_STOCK) : undefined}
          onSelect={select}
          labelScale={present ? 1.35 : 1}
        >
          {route && (
            <RouteOverlay route={route} layout={layout} step={step} playing={playing} onArrive={arrive} labelScale={present ? 1.3 : 1} />
          )}
        </Warehouse3D>
        <ViewActions onRefresh={refresh} refreshing={refreshing} />
      </div>
      <aside className="sidebar">
        {mobile ? (
          <button className="panel-toggle" aria-expanded={panelOpen} onClick={() => setPanelOpen((o) => !o)}>
            <span>{layout.name}</span>
            <span aria-hidden="true">{panelOpen ? '▾' : '▴'}</span>
          </button>
        ) : (
          <h1 className="title">{layout.name}</h1>
        )}
        {!stockMode && !onlyLoad && (
          <button className="link-button back" onClick={openWarehouse}>
            ← Vista de almacén
          </button>
        )}
        {stockMode && (
          <StockPanel
            layout={layout}
            stock={stock}
            view={stockView}
            failed={stockFailed}
            onRetry={retryStock}
            mode={host.theme}
            query={query}
            onQuery={setQuery}
            matches={matches}
            onSelect={select}
          />
        )}
        {onlyLoad && routes.length > 0 && (
          <div className="order-tabs">
            {byOrder(routes).map((g) => (
              <div key={g.order ?? ''} className="order-group">
                <span className="order-label">{g.order ? `Pedido ${g.order}` : 'Sin pedido'}</span>
                <div className="tabs" role="tablist">
                  {g.routes.map(({ route: r, index }) => (
                    <button key={r.workId} role="tab" aria-selected={index === routeIndex} className={index === routeIndex ? 'active' : ''} onClick={() => pickRoute(index)}>
                      {r.workId}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {!onlyLoad && routes.length > 1 && (
          <div className="tabs" role="tablist">
            {routes.map((r, i) => (
              <button key={r.workId} role="tab" aria-selected={i === routeIndex} className={i === routeIndex ? 'active' : ''} onClick={() => pickRoute(i)}>
                {r.workId}
              </button>
            ))}
          </div>
        )}
        {route && (
          <RoutePanel
            route={route}
            step={step}
            playing={playing}
            onStep={goTo}
            onNext={next}
            onPlay={play}
            onPause={() => setPlaying(false)}
          />
        )}
        {selected ? (
          <LocationPanel
            location={selected}
            onClose={() => setSelectedId(null)}
            stock={stockMode && stockView ? (stockView.byLocation.get(selected.locationId) ?? null) : undefined}
            onOpenWork={openWork}
            planned={!!layout?.building}
          />
        ) : (
          !route && <p className="hint">Toca una ubicación para ver sus datos.</p>
        )}
        {!present && !onlyLoad && (
          <WorksPanel
            warehouseId={layout.warehouseId}
            reload={reload}
            selectedWorkId={target?.kind === 'work' ? target.id : null}
            onPick={openWork}
          />
        )}
        {!present && <DevFooter host={host} />}
      </aside>
    </div>
  )
}

// Solo fuera de ?present=1: de dónde salen los datos (útil para no liarse entre mock y F&O).
function DevFooter({ host }: { host: HostInfo }) {
  const [api, setApi] = useState<string>(dataSource === 'mock' ? 'ficheros /mock' : 'comprobando API…')
  useEffect(() => {
    if (dataSource !== 'api') return
    getHealth().then(
      (h) => setApi(`API v${h.version} · ${h.mockMode ? 'MOCK' : 'F&O'}`),
      () => setApi('API sin respuesta'),
    )
  }, [])
  return (
    <footer className="dev-footer">
      Datos: {api} · host: {host.kind} · tema: {host.theme}
    </footer>
  )
}

function describe(e: unknown, what: string): Problem {
  if (e instanceof NotFoundError) {
    return { title: `No encuentro ${what}.`, detail: 'Comprueba el número en Dynamics 365 o pide al responsable que te lo reenvíe.' }
  }
  if (e instanceof FnoUnavailableError) {
    return { title: 'Dynamics 365 no responde ahora mismo.', detail: 'Vuelve a intentarlo en un momento.' }
  }
  if (e instanceof UnauthorizedError) {
    return { title: 'Tu sesión no vale para ver esto.', detail: 'Recarga la página para volver a entrar.' }
  }
  return { title: `No he podido cargar ${what}.`, detail: 'Revisa la conexión y vuelve a intentarlo.' }
}
