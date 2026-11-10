// Tipos del contrato (docs/api-contract.md). No añadir campos sin cambiar antes el contrato.

export type Zone = 'PICK' | 'BULK' | 'STAGE' | 'DOCK' | (string & {})

export type Location = {
  locationId: string
  zone: Zone
  aisle: string
  rack: number
  level: number
  x: number
  y: number
  z: number
  profile: string
  sizeX?: number
  sizeY?: number
  sizeZ?: number
  // Metros desde el suelo donde empieza el hueco (alturas reales del perfil apiladas). Sin él: level × levelHeight.
  baseZ?: number
  // La ubicación tal cual está en F&O. zone/aisle/rack/level/x de arriba son los del dibujo, no los de F&O.
  fno?: FnoLocation
}

export type FnoLocation = { zone?: string; aisle?: string; rack: number; shelf: number; bin: number; x: number; y: number; z: number }

export type DistanceStrategy = 'StraightLine' | 'CityBlock'
export type SortAlgorithm = 'Fast' | 'Optimized'

export type Layout = {
  warehouseId: string
  name: string
  bounds: { minX: number; maxX: number; minY: number; maxY: number; maxLevel: number }
  locations: Location[]
  putLocations: string[]
  distanceStrategy: DistanceStrategy
  sortAlgorithm: SortAlgorithm
  // Plano de la nave (medidas y zonas en F&O). Sin él, solo las ubicaciones con coordenadas.
  building?: Building
  zones?: LayoutZone[]
  aisles?: LayoutAisle[]
  levelHeight?: number // metros por nivel (altura de estanterías / niveles); sin él, theme.sizes.levelHeight
}

// Medidas de la nave en metros. X = largo (zonas en orden), Y = ancho.
export type Building = { length: number; width: number; clearHeight: number; rackHeight: number }

export type ZoneFunction = 'Receiving' | 'PutAway' | 'Storage' | 'Consolidation' | 'Shipping'

export type LayoutZone = { number: number; name: string; function: ZoneFunction; x: number; length: number; width: number }

// Pasillo de doble cara: x es el centro (por donde se camina); las estanterías quedan a cada lado.
export type LayoutAisle = { aisleId: string; name: string; x: number; minY: number; maxY: number }

export type RouteLine = {
  lineNum: number
  workType: 'Pick' | 'Put'
  locationId: string
  itemId: string
  itemName: string
  qty: number
  unit: string
  x: number
  y: number
  z: number
  distanceToNext: number
  pickedAt?: string // hora real del pick (works en curso o cerrados)
}

export type Route = {
  workId: string
  loadId?: string
  warehouseId: string
  workStatus: string
  strategy: DistanceStrategy
  algorithm: SortAlgorithm
  putLocation: { locationId: string; x: number; y: number; z: number }
  lines: RouteLine[]
  totalDistance: number
  explanation: string[]
  startedAt?: string
  closedAt?: string
  // De dónde sale el picker (ubicación de inicio del almacén en F&O). F&O no lo usa al ordenar.
  startLocation?: { locationId: string; x: number; y: number; z: number }
  // La ruta es un tramo posterior del work: dónde se dejó la mercancía en el anterior (STAGE-OUT).
  previousPut?: string
  // Pedido del work (SourceOrderNumber de F&O).
  orderNumber?: string
}

// Primer paso de la ruta: -1 si hay ubicación de inicio (el picker aún no ha llegado al primer pick), 0 si no.
export function firstStep(route: Route | null | undefined): number {
  return route?.startLocation ? -1 : 0
}

export type WorkSummary = {
  workId: string
  loadId?: string
  warehouseId: string
  workStatus: string
  startedAt?: string
  closedAt?: string
}

export type WorkStatusFilter = 'open' | 'closed' | 'all'

// Vista de almacén (GET /warehouses/{wh}/stock). Solo vienen las ubicaciones con stock o con picks abiertos.
export type StockItem = {
  itemId: string
  itemName: string
  qty: number
  unit: string
  licensePlate?: string
  inventoryStatus?: string
}

export type OpenPick = { workId: string; lineNum: number; itemId: string; qty: number; unit: string }

export type LocationStock = { locationId: string; qty: number; items: StockItem[]; openPicks: OpenPick[] }

export type WarehouseStock = {
  warehouseId: string
  asOf: string
  qtyBasis: 'AvailablePhysical' | (string & {})
  locations: LocationStock[]
}

export type LocationDetail = Location & {
  deepLinkTeams: string
  deepLinkWeb: string
  neighbours: string[]
}
