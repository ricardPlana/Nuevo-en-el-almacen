// Estado del hub en la URL (/hub/?company=w3d&warehouseId=CH01&view=works&status=closed&cancelled=1&page=2…):
// se puede enlazar, recargar y el Atrás del navegador (y Alt+←) funciona. Una sola URL de entrada: /hub/.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ListStatus, LocationFilter } from './api'

export type View = 'home' | 'warehouses' | 'works' | 'loads' | 'items' | 'locations' | 'labels' | 'occupancy' | 'operators' | 'orders' | '3d'
export type OpenKind = 'work' | 'load' | 'location' | 'warehouse'
export type ItemStockFilter = 'all' | 'any' | 'warehouse'
export type PickPeriod = 'day' | 'week' | 'month'
// Etiquetas: 50 × 30 mm, 100 × 50 mm o hoja A4 de 21.
export type LabelFormat = 'small' | 'medium' | 'a4'
export const LABEL_FORMATS: LabelFormat[] = ['small', 'medium', 'a4']

export type HubState = {
  company?: string
  warehouseId?: string
  view: View
  status: ListStatus
  cancelled: boolean
  page: number // 0 = primera
  size: number
  q: string
  item?: string
  itemStock: ItemStockFilter // artículos: todos, con stock o con stock en el almacén elegido
  locFilter: LocationFilter // ubicaciones: todas, con stock, vacías o con picks pendientes
  zone: string
  aisle: string
  profile: string
  loc?: string // ubicación abierta en la lista
  locs?: string[] // etiquetas de estas ubicaciones (en vez de las del filtro)
  period: PickPeriod // revisión de operarios: un día, los últimos 7 o los últimos 30
  day?: string // revisión de operarios: el día (AAAA-MM-DD); sin él, hoy
  operator: string // revisión de operarios: usuario móvil; vacío, todos
  expanded: string[] // cargas o pedidos abiertos en la lista (siguen abiertos al volver del 3D)
  open?: { kind: OpenKind; id: string; warehouseId: string } // view=3d
  from?: View // a dónde vuelve la flecha desde el 3D
}

const VIEWS: View[] = ['home', 'warehouses', 'works', 'loads', 'items', 'locations', 'labels', 'occupancy', 'operators', 'orders', '3d']
const LOC_FILTERS: LocationFilter[] = ['all', 'stock', 'empty', 'picks']
const KINDS: OpenKind[] = ['work', 'load', 'location', 'warehouse']
// Parámetros que no son del hub y se conservan al navegar (tema, móvil, Teams).
const KEEP = ['mobile', 'theme', 'host', 'fmt', 'bc']

export const PAGE_SIZES = [10, 25, 50]

export function readState(search = window.location.search): HubState {
  const p = new URLSearchParams(search)
  const view = VIEWS.find((v) => v === p.get('view')) ?? 'home'
  const status = p.get('status')
  const size = Number(p.get('size'))
  const [kind, ...rest] = (p.get('open') ?? '').split(':')
  const openKind = KINDS.find((k) => k === kind)
  const openWh = p.get('openWarehouse') ?? p.get('warehouseId') ?? ''
  return {
    company: p.get('company')?.toLowerCase() || undefined,
    warehouseId: p.get('warehouseId') || undefined,
    view: view === '3d' && !openKind ? 'home' : view,
    status: status === 'closed' || status === 'all' ? status : 'open',
    cancelled: p.get('cancelled') === '1',
    page: Math.max(0, (Number(p.get('page')) || 1) - 1),
    size: PAGE_SIZES.includes(size) ? size : 25,
    q: p.get('q') ?? '',
    item: p.get('item') || undefined,
    itemStock: p.get('stock') === 'any' ? 'any' : p.get('stock') === 'wh' ? 'warehouse' : 'all',
    locFilter: LOC_FILTERS.find((f) => f === p.get('filter')) ?? 'all',
    zone: p.get('zone') ?? '',
    aisle: p.get('aisle') ?? '',
    profile: p.get('profile') ?? '',
    loc: p.get('loc') || undefined,
    locs: p.get('locs')?.split(',').filter(Boolean) || undefined,
    day: /^\d{4}-\d{2}-\d{2}$/.test(p.get('day') ?? '') ? (p.get('day') as string) : undefined,
    period: p.get('period') === 'week' ? 'week' : p.get('period') === 'month' ? 'month' : 'day',
    operator: p.get('operator') ?? '',
    expanded: p.get('expanded')?.split(',').filter(Boolean) ?? [],
    open: openKind && rest.length ? { kind: openKind, id: rest.join(':'), warehouseId: openWh } : undefined,
    from: VIEWS.find((v) => v === p.get('from') && v !== '3d'),
  }
}

export function toSearch(s: HubState): string {
  const cur = new URLSearchParams(window.location.search)
  const p = new URLSearchParams()
  if (s.company) p.set('company', s.company)
  if (s.warehouseId) p.set('warehouseId', s.warehouseId)
  if (s.view !== 'home') p.set('view', s.view)
  const list = s.view === 'works' || s.view === 'loads'
  const locs = s.view === 'locations' || s.view === 'labels'
  const paged = list || s.view === 'items' || locs || s.view === 'operators' || s.view === 'orders'
  if ((s.view === 'loads' || s.view === 'orders') && s.expanded.length) p.set('expanded', s.expanded.join(','))
  if (s.view === 'operators') {
    if (s.period !== 'day') p.set('period', s.period)
    if (s.day && s.period === 'day') p.set('day', s.day)
    if (s.operator) p.set('operator', s.operator)
  }
  if (list && s.status !== 'open') p.set('status', s.status)
  if (list && s.cancelled && s.status !== 'open') p.set('cancelled', '1')
  if (paged && s.page > 0) p.set('page', String(s.page + 1))
  if (paged && s.size !== 25) p.set('size', String(s.size))
  if (paged && s.q) p.set('q', s.q)
  if (locs) {
    if (s.locFilter !== 'all') p.set('filter', s.locFilter)
    if (s.zone) p.set('zone', s.zone)
    if (s.aisle) p.set('aisle', s.aisle)
    if (s.profile) p.set('profile', s.profile)
    if (s.view === 'locations' && s.loc) p.set('loc', s.loc)
    if (s.view === 'labels' && s.locs?.length) p.set('locs', s.locs.join(','))
  }
  if (s.view === 'items' && s.item) p.set('item', s.item)
  if (s.view === 'items' && s.itemStock !== 'all') p.set('stock', s.itemStock === 'any' ? 'any' : 'wh')
  if (s.view === '3d' && s.open) {
    p.set('open', `${s.open.kind}:${s.open.id}`)
    if (s.open.warehouseId !== s.warehouseId) p.set('openWarehouse', s.open.warehouseId)
    if (s.from) p.set('from', s.from)
  }
  for (const k of KEEP) {
    const v = cur.get(k)
    if (v) p.set(k, v)
  }
  const text = p.toString()
  return text ? `?${text}` : ''
}

type Entry = { hubDepth: number }

function depth(): number {
  return (window.history.state as Entry | null)?.hubDepth ?? 0
}

export function useHubState(): [HubState, (patch: Partial<HubState>, replace?: boolean) => void, () => void] {
  const [state, setState] = useState(readState)
  // El último estado, para navegar sin efectos dentro de setState (StrictMode los repetiría).
  const current = useRef(state)

  useEffect(() => {
    const onPop = () => {
      current.current = readState()
      setState(current.current)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((patch: Partial<HubState>, replace = false) => {
    const next = { ...current.current, ...patch }
    const url = `${window.location.pathname}${toSearch(next)}`
    if (replace) window.history.replaceState({ hubDepth: depth() } satisfies Entry, '', url)
    else window.history.pushState({ hubDepth: depth() + 1 } satisfies Entry, '', url)
    current.current = next
    setState(next)
  }, [])

  // Flecha de volver: si se llegó navegando por el hub, es el Atrás del navegador; si se entró directo por un
  // enlace (sin historial del hub), sube un nivel: del 3D a la lista de la que venía, de una lista al inicio.
  const back = useCallback(() => {
    if (depth() > 0) {
      window.history.back()
      return
    }
    const prev = current.current
    const next: HubState = prev.view === '3d' ? { ...prev, view: prev.from ?? 'home', open: undefined } : { ...prev, view: 'home', page: 0, q: '' }
    window.history.replaceState({ hubDepth: 0 } satisfies Entry, '', `${window.location.pathname}${toSearch(next)}`)
    current.current = next
    setState(next)
  }, [])

  return [state, navigate, back]
}
