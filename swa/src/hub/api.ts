// Cliente del hub: /api/hub/* y el plano de /api/warehouses/{id}/layout. La empresa va en cada llamada
// (en el hub se cambia sin recargar), no en la URL como en la vista 3D.
import type { Layout } from '../types'
import { getToken } from '../auth/auth'
import { FnoUnavailableError, NotFoundError, UnauthorizedError } from '../api/client'

const apiUrl: string = import.meta.env.VITE_API_URL ?? '/api'

export type Page<T> = { total: number; items: T[] }
export type Company = { company: string; name: string; warehouses: number }
export type Warehouse = { warehouseId: string; name: string }
export type WarehouseSummary = {
  warehouseId: string
  name: string
  locations: number
  locationsWithStock: number
  aisles: number
  openWorks: number
  building?: { length: number; width: number; clearHeight: number; rackHeight: number }
  distanceStrategy: string
  sortAlgorithm: string
  startLocation?: string
}
export type HubWork = {
  workId: string
  warehouseId: string
  status: string
  orderType: string
  orderNumber?: string
  loadId?: string
  lines: number
  startedAt?: string
  closedAt?: string
  lockedBy?: { userId: string; name?: string }
}
export type HubLoad = { loadId: string; warehouseId: string; status: string; works: number; openWorks: number; loadStatus?: string }
export type LoadPick = { lineNum: number; locationId: string; itemId?: string; itemName?: string; qty: number; unit?: string; done: boolean }
export type LoadWork = {
  workId: string
  loadId?: string
  status: string
  stage: 'Picking' | 'Staged' | 'Loaded' | 'Cancelled'
  stageLocation?: string
  lockedBy?: { userId: string; name?: string }
  picks: LoadPick[]
}
export type LoadDetail = { loadId: string; warehouseId: string; loadStatus?: string; orders: { orderNumber?: string; works: LoadWork[] }[] }
export type HubOrder = {
  orderNumber: string
  customerAccount?: string
  customerName?: string
  status?: string
  requestedShipping?: string
  works: number
  inProcess: number
  loads: string[]
}
export type OrderDetail = { orderNumber: string; warehouseId: string; works: LoadWork[] }
export type HubItem = { itemId: string; name: string; unit: string; qty: number; locations: number; warehouses: number }
export type FnoLocation = { zone?: string; aisle?: string; rack: number; shelf: number; bin: number; x: number; y: number; z: number }
export type ItemLocation = { warehouseId: string; locationId: string; qty: number; licensePlate?: string; inventoryStatus?: string; fno?: FnoLocation }
export type ItemStock = { itemId: string; name: string; unit: string; qty: number; openPicks: number; openPickQty: number; locations: ItemLocation[] }
export type HubLocation = {
  locationId: string
  zone?: string
  aisle?: string
  rack: number
  shelf: number
  bin: number
  profile?: string
  x: number
  y: number
  z: number
  qty: number
  items: number
  itemIds: string[]
  openPicks: number
}
export type LocationDetail = {
  location: HubLocation
  contents: { itemId: string; itemName: string; qty: number; unit: string; licensePlate?: string; inventoryStatus?: string }[]
  picks: { workId: string; lineNum: number; itemId: string; qty: number; unit: string }[]
}
export type LocationFacets = { total: number; zones: string[]; aisles: string[]; profiles: string[] }
export type Operator = { userId: string; name?: string }
export type HubPick = {
  workId: string
  lineNum: number
  userId?: string
  userName?: string
  closedAt?: string
  locationId: string
  itemId?: string
  itemName?: string
  qty: number
  unit?: string
  seconds: number
  orderNumber?: string
  loadId?: string
}
export type Picks = Page<HubPick> & { works: number; seconds: number }
export type LocationFilter = 'all' | 'stock' | 'empty' | 'picks'
export type OccupancyGroup = { key?: string; total: number; withStock: number; withPicks: number }
export type Occupancy = { warehouse: OccupancyGroup; aisles: OccupancyGroup[]; zones: OccupancyGroup[] }
export type Match ={ kind: 'work' | 'load' | 'location' | 'item'; id: string; warehouseId?: string; label: string }
export type MyWork = { workId: string; warehouseId: string; picks: number; totalDistance: number; firstLocation?: string }

export type ListStatus = 'open' | 'closed' | 'all'

const enc = encodeURIComponent

async function get<T>(path: string, params: Record<string, string | number | boolean | undefined>): Promise<T> {
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '' && v !== false)
    .map(([k, v]) => `${k}=${enc(v === true ? '1' : String(v))}`)
    .join('&')
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = await getToken()
  if (token) headers['X-Wh3d-Token'] = token
  const url = `${apiUrl}/${path}${query ? `?${query}` : ''}`
  const res = await fetch(url, { headers })
  if (res.status === 404) throw new NotFoundError(url)
  if (res.status === 401) throw new UnauthorizedError(url)
  if (res.status === 502) throw new FnoUnavailableError(url)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export const hubApi = {
  companies: () => get<Company[]>('hub/companies', {}),
  warehouses: (company: string) => get<Warehouse[]>('hub/warehouses', { company }),
  summary: (company: string, warehouseId: string) => get<WarehouseSummary>(`hub/warehouses/${enc(warehouseId)}/summary`, { company }),
  works: (company: string, warehouseId: string, status: ListStatus, cancelled: boolean, q: string, skip: number, top: number) =>
    get<Page<HubWork>>('hub/works', { company, warehouseId, status, cancelled, q, skip, top }),
  loads: (company: string, warehouseId: string, status: ListStatus, cancelled: boolean, q: string, skip: number, top: number) =>
    get<Page<HubLoad>>('hub/loads', { company, warehouseId, status, cancelled, q, skip, top }),
  loadDetail: (company: string, warehouseId: string, loadId: string, cancelled: boolean) =>
    get<LoadDetail>(`hub/loads/${enc(loadId)}`, { company, warehouseId, cancelled }),
  orders: (company: string, warehouseId: string, q: string, skip: number, top: number) => get<Page<HubOrder>>('hub/orders', { company, warehouseId, q, skip, top }),
  orderDetail: (company: string, warehouseId: string, orderNumber: string) => get<OrderDetail>(`hub/orders/${enc(orderNumber)}`, { company, warehouseId }),
  items: (company: string, warehouseId: string | undefined, withStock: boolean, q: string, skip: number, top: number) =>
    get<Page<HubItem>>('hub/items', { company, warehouseId, stock: withStock, q, skip, top }),
  itemStock: (company: string, itemId: string, warehouseId?: string) => get<ItemStock>(`hub/items/${enc(itemId)}/stock`, { company, warehouseId }),
  locations: (company: string, warehouseId: string, filter: LocationFilter, zone: string, aisle: string, profile: string, q: string, skip: number, top: number) =>
    get<Page<HubLocation>>('hub/locations', { company, warehouseId, filter: filter === 'all' ? undefined : filter, zone, aisle, profile, q, skip, top }),
  operators: (company: string) => get<Operator[]>('hub/operators', { company }),
  picks: (company: string, warehouseId: string, from: string, to: string, userId: string, skip: number, top: number) =>
    get<Picks>('hub/picks', { company, warehouseId, from, to, userId, skip, top }),
  occupancy: (company: string, warehouseId: string) => get<Occupancy>('hub/occupancy', { company, warehouseId }),
  locationFacets: (company: string, warehouseId: string) => get<LocationFacets>('hub/location-facets', { company, warehouseId }),
  location: (company: string, warehouseId: string, locationId: string) => get<LocationDetail>(`hub/locations/${enc(locationId)}`, { company, warehouseId }),
  resolve: (company: string, q: string) => get<Match[]>('hub/resolve', { company, q }),
  me: (company: string) => get<MyWork[]>('hub/me', { company }),
  layout: (company: string, warehouseId: string) => get<Layout>(`warehouses/${enc(warehouseId)}/layout`, { company }),
}
