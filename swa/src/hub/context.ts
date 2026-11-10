import type { Company, Warehouse } from './api'
import type { HubState, OpenKind } from './nav'

// Lo que el marco del hub pasa a cada pantalla.
export type HubCtx = {
  state: HubState
  navigate: (patch: Partial<HubState>, replace?: boolean) => void
  compact: boolean
  company: string
  companies: Company[]
  warehouseId: string | undefined
  warehouses: Warehouse[]
  // Abre la vista 3D de siempre (work, carga, ubicación o almacén) dentro del hub.
  open3d: (kind: OpenKind, id: string, warehouseId: string) => void
}

export function openPatch(state: HubState, kind: OpenKind, id: string, warehouseId: string): Partial<HubState> {
  return { view: '3d', open: { kind, id, warehouseId }, from: state.view === '3d' ? state.from : state.view }
}

// URL de la vista 3D actual (la misma que abren F&O y Teams), sin cambiarle nada: ?company=&warehouseId= y el objetivo.
// En móvil, &mobile=1: la vista 3D pone el panel abajo y plegable en vez de en una columna al lado.
// Una carga, con &scope=load: el panel enseña solo esa carga, sin los works del resto del almacén.
export function viewUrl(company: string, kind: OpenKind, id: string, warehouseId: string, upn?: string, mobile = false): string {
  const p = new URLSearchParams({ company, warehouseId })
  if (kind === 'work') p.set('workId', id)
  if (kind === 'load') {
    p.set('loadId', id)
    p.set('scope', 'load')
  }
  if (kind === 'location') p.set('locationId', id)
  if (upn) p.set('upn', upn)
  if (mobile) p.set('mobile', '1')
  const theme = new URLSearchParams(window.location.search).get('theme')
  if (theme === 'dark' || theme === 'light') p.set('theme', theme)
  return `/?${p.toString()}`
}

export type Recent = { kind: OpenKind; id: string; warehouseId: string; company: string; at: number }
const RECENT_KEY = 'wh3d.hub.recent'

// Lo último abierto en el 3D desde este navegador (máx. 5).
export function recents(company: string): Recent[] {
  try {
    const all = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Recent[]
    return all.filter((r) => r.company === company)
  } catch {
    return []
  }
}

export function addRecent(r: Omit<Recent, 'at'>): void {
  try {
    const all = (JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as Recent[]).filter(
      (x) => !(x.company === r.company && x.kind === r.kind && x.id === r.id && x.warehouseId === r.warehouseId),
    )
    localStorage.setItem(RECENT_KEY, JSON.stringify([{ ...r, at: Date.now() }, ...all].slice(0, 15)))
  } catch {
    // sin almacenamiento: sin recientes
  }
}

// Lo que abre el QR de una ubicación: su ficha en el hub (en el móvil sale la versión compacta sola).
export function locationLink(company: string, warehouseId: string, locationId: string): string {
  const p = new URLSearchParams({ company, warehouseId, view: 'locations', loc: locationId })
  return `${window.location.origin}/hub/?${p.toString()}`
}

const KEY = 'wh3d.hub'

// Última empresa y último almacén por empresa, por comodidad (si el navegador no deja guardar, no pasa nada).
export function remembered(): { company?: string; warehouses: Record<string, string> } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { company?: string; warehouses?: Record<string, string> }
    return { company: v.company, warehouses: v.warehouses ?? {} }
  } catch {
    return { warehouses: {} }
  }
}

export function remember(company: string, warehouseId?: string): void {
  try {
    const v = remembered()
    if (warehouseId) v.warehouses[company] = warehouseId
    localStorage.setItem(KEY, JSON.stringify({ company, warehouses: v.warehouses }))
  } catch {
    // sin almacenamiento: se elige cada vez
  }
}
