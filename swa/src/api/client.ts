// Única puerta HTTP de la SPA. Decide mock vs API y (Tarea 5) adjunta el token en X-Wh3d-Token.
import type { Layout, Route, WarehouseStock, WorkStatusFilter, WorkSummary } from '../types'
import { getToken } from '../auth/auth'

export type DataSource = 'mock' | 'api'

export const dataSource: DataSource = import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'mock'

const apiUrl: string = import.meta.env.VITE_API_URL ?? '/api'

// Empresa de F&O (dataAreaId): la pasa la extensión X++ en ?company=. Sin ella, la API usa FNO_COMPANY.
const company = new URLSearchParams(window.location.search).get('company')

export type Health = { status: string; mockMode: boolean; version: string }

export class NotFoundError extends Error {}
export class UnauthorizedError extends Error {}
export class FnoUnavailableError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  // SWA pisa Authorization en las managed functions: el token va en X-Wh3d-Token.
  if (dataSource === 'api' && url.startsWith(apiUrl)) {
    const token = await getToken()
    if (token) headers['X-Wh3d-Token'] = token
  }
  if (dataSource === 'api' && url.startsWith(apiUrl) && company) {
    url += `${url.includes('?') ? '&' : '?'}company=${enc(company)}`
  }
  const res = await fetch(url, { headers })
  if (res.status === 404) {
    throw new NotFoundError(url)
  }
  if (res.status === 401) {
    throw new UnauthorizedError(url)
  }
  if (res.status === 502) {
    throw new FnoUnavailableError(url)
  }
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText} — ${url}`)
  }
  return (await res.json()) as T
}

const enc = encodeURIComponent

export function getHealth(): Promise<Health> {
  return getJson<Health>(`${apiUrl}/health`)
}

// refresh: botón ↻, la API vuelve a leer de F&O en vez de usar su caché del plano.
export function getLayout(warehouseId: string, refresh = false): Promise<Layout> {
  return getJson<Layout>(
    dataSource === 'mock'
      ? `/mock/layout-${enc(warehouseId)}.json`
      : `${apiUrl}/warehouses/${enc(warehouseId)}/layout${refresh ? '?refresh=1' : ''}`,
  )
}

export function getRoute(workId: string): Promise<Route> {
  return getJson<Route>(dataSource === 'mock' ? `/mock/route-${enc(workId)}.json` : `${apiUrl}/work/${enc(workId)}/route`)
}

export async function listWorks(warehouseId: string, status: WorkStatusFilter): Promise<WorkSummary[]> {
  if (dataSource === 'api') {
    return getJson<WorkSummary[]>(`${apiUrl}/warehouses/${enc(warehouseId)}/works?status=${status}&top=50`)
  }
  const all = await getJson<WorkSummary[]>(`/mock/works-${enc(warehouseId)}.json`)
  return all.filter((w) => status === 'all' || (status === 'closed') === (w.workStatus === 'Closed'))
}

export function getStock(warehouseId: string): Promise<WarehouseStock> {
  return getJson<WarehouseStock>(
    dataSource === 'mock' ? `/mock/stock-${enc(warehouseId)}.json` : `${apiUrl}/warehouses/${enc(warehouseId)}/stock`,
  )
}

export function getLoadRoutes(loadId: string): Promise<Route[]> {
  return getJson<Route[]>(dataSource === 'mock' ? `/mock/load-${enc(loadId)}.json` : `${apiUrl}/loads/${enc(loadId)}/route`)
}
