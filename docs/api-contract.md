# Contrato de la API

Base: `https://<swa-host>/api` (managed functions de la propia SWA) · Auth: cabecera **`X-Wh3d-Token: <token Entra>`** (scope `access_as_user`) desde la SPA, o **`x-wh3d-key: <AGENT_API_KEY>`** desde el agente; salvo `AUTH_DISABLED=true` en local. No se usa `Authorization` porque SWA la sobrescribe en las managed functions. Especificación completa en `api/openapi.yaml` (es la que se importa en el custom connector de Copilot Studio).

## Endpoints

| Método | Ruta | Devuelve | Quién lo usa |
|---|---|---|---|
| GET | `/health` | `{ status, mockMode, version }` | Todos |
| GET | `/warehouses/{warehouseId}/layout` | `Layout` (caché 5 min; `?refresh=1` la salta) | SWA |
| GET | `/warehouses/{warehouseId}/locations/{locationId}` | `LocationDetail` | SWA, agente (`GetLocation`) |
| GET | `/work/{workId}/route` | `Route` | SWA, agente (`GetRoute`) |
| GET | `/loads/{loadId}/route` | `Route[]` (una por work de la carga) | SWA, agente (`GetLoadRoute`) |
| GET | `/work/{workId}/card` | Adaptive Card JSON | Agente |
| GET | `/warehouses/{warehouseId}/works?status=open\|closed\|all&top=50` | `WorkSummary[]` (más recientes primero) | SWA (histórico) |
| GET | `/works/started?minutes=5&warehouseId=` | `StartedWork[]`: works cogidos en la app móvil (Locked by) en los últimos N min, con correo y tarjeta | Power Automate (aviso "tu ruta") |
| GET | `/warehouses/{warehouseId}/stock` | `WarehouseStock` (ubicaciones con stock o con picks abiertos) | SWA (vista de almacén) |

Todos (salvo `/health`) aceptan `?company=<dataAreaId>`: la empresa de F&O. La SPA reenvía la que le llega en su URL (la pone la extensión X++ con el `DataAreaId` del registro); sin ella, la API usa `FNO_COMPANY`.

Errores: `404 { error: "WORK_NOT_FOUND", workId }`, `400 { error: "INVALID_COMPANY" }`, `502 { error: "FNO_UNAVAILABLE" }`, `401`.

## Tipos

```ts
type Location = {
  locationId: string;     // "A-05-1"
  zone: string;           // "PICK" | "BULK" | "STAGE" | "DOCK"
  aisle: string;          // "A"
  rack: number;           // 12
  level: number;          // 2  (0 = suelo)
  x: number; y: number; z: number;   // unidades de F&O (en el mock, metros)
  profile: string;        // location profile de F&O
  sizeX?: number; sizeY?: number; sizeZ?: number; // para dibujar; opcional. Con perfil medido: fondo, ancho y alto reales
  baseZ?: number; // m desde el suelo donde empieza el hueco (alturas del perfil apiladas en su columna); sin él, level × levelHeight
  // Con F&O: la ubicación tal cual está en WarehouseLocations. zone/aisle/rack/level/x/y de arriba son los del dibujo
  // (zone = tipo de hueco para el color, rack = posición a lo largo de la fila, level desde 0, x = centro de la estantería).
  fno?: { zone?: string; aisle?: string; rack: number; shelf: number; bin: number; x: number; y: number; z: number };
};

type Layout = {
  warehouseId: string;    // "24"
  name: string;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; maxLevel: number };
  locations: Location[];
  putLocations: string[]; // ids de muelles / staging
  distanceStrategy: "StraightLine" | "CityBlock";
  sortAlgorithm: "Fast" | "Optimized";
  // Solo si el almacén tiene nave o zonas en F&O (campos D365_* y entidad InventLocationZones):
  building?: { length: number; width: number; clearHeight: number; rackHeight: number }; // metros; X = largo, Y = ancho
  zones?: { number: number; name: string; function: ZoneFunction; x: number; length: number; width: number }[];
  aisles?: { aisleId: string; name: string; x: number; minY: number; maxY: number }[]; // x = centro del pasillo de doble cara
  levelHeight?: number;   // m por nivel = D365_AlturaEstanterias / niveles (1–3 m); sin él, 1,2
};

type ZoneFunction = "Receiving" | "PutAway" | "Storage" | "Consolidation" | "Shipping";

type RouteLine = {
  lineNum: number;        // orden tras "Sort picking work lines"
  workType: "Pick" | "Put";
  locationId: string;
  itemId: string;
  itemName: string;
  qty: number;
  unit: string;
  x: number; y: number; z: number;
  distanceToNext: number; // aritmética con la fórmula de F&O; en la última, distancia hasta el put
  pickedAt?: string;      // ISO; hora real del pick (works en curso o cerrados)
};

type Route = {
  workId: string;         // "W-1203"
  loadId?: string;        // "LD-0042"
  warehouseId: string;
  workStatus: string;     // "Open" | "InProcess" | "Closed"
  strategy: "StraightLine" | "CityBlock";
  algorithm: "Fast" | "Optimized";
  putLocation: { locationId: string; x: number; y: number; z: number };
  lines: RouteLine[];     // picks del primer tramo con líneas sin hacer (picks → put), en el orden de F&O (LineNum tras el sort). Cerrado o cancelado: el primer tramo
  totalDistance: number;
  explanation: string[];  // frases cortas que la API genera y el agente puede citar
  startedAt?: string;     // ISO; inicio real del work
  closedAt?: string;      // ISO; cierre real del work
  // De dónde sale el picker: D365_UbicacionInicio del almacén. F&O no lo usa al ordenar; no entra en totalDistance.
  startLocation?: { locationId: string; x: number; y: number; z: number };
  orderNumber?: string;   // pedido del work (SourceOrderNumber)
  previousPut?: string;   // la ruta es un tramo posterior: dónde se dejó la mercancía en el anterior ("STAGE-OUT"). Sin startLocation
};
// lines[].x/y/z y putLocation son las coordenadas de F&O (con ellas se calculan las distancias). Si la ubicación no tiene,
// la posición que le da el plano. El 3D dibuja con la posición del layout.

// Aviso "tu ruta". Locked by → WarehouseMobileDeviceUsers (nº de personal) → Workers (IdentityEmail o PrimaryContactEmail).
// Solo works con hora de inicio dentro de la ventana (sin hora no se avisa: si no, saldría en cada pasada del flujo).
type StartedWork = { workId: string; warehouseId: string; loadId?: string; workStatus: string; startedAt?: string;
  userId: string; personnelNumber?: string; workerName?: string; email?: string; picks: number; totalDistance: number;
  cardJson: string }; // Adaptive Card 1.5 como texto, con saludo ("Hola Julia, acabas de empezar…")

type WorkSummary = { workId: string; loadId?: string; warehouseId: string; workStatus: string; startedAt?: string; closedAt?: string };

// Vista de almacén. En F&O: ProjInventoryOnHand (disponible físico, sumado por ubicación + artículo +
// matrícula + estado; lo que queda ≤ 0 se descarta) y WarehouseWorkLines Pick en estado Open/InProcess.
type StockItem = { itemId: string; itemName: string; qty: number; unit: string; licensePlate?: string; inventoryStatus?: string };
type OpenPick = { workId: string; lineNum: number; itemId: string; qty: number; unit: string }; // qty = cantidad pendiente
type LocationStock = { locationId: string; qty: number; items: StockItem[]; openPicks: OpenPick[] };
type WarehouseStock = {
  warehouseId: string;
  asOf: string;           // ISO; momento de la lectura
  qtyBasis: "AvailablePhysical";
  locations: LocationStock[]; // solo las que tienen stock o picks abiertos; el resto, vacías
};

type LocationDetail = Location & {
  deepLinkTeams: string;
  deepLinkWeb: string;
  neighbours: string[];   // 4 ubicaciones más cercanas (para "¿qué hay al lado?")
};
```

## Hub (`/api/hub/*`)

Para la página `/hub/` de la SPA (empresas, almacenes, works, cargas y artículos). Solo lectura; no cambian los endpoints de arriba. Listas con `?skip=&top=` (top 1–100, por defecto 25) y `?company=` como el resto.

| Ruta | Devuelve |
|---|---|
| `/hub/companies` | `{ company, name, warehouses }[]`: empresas con almacenes de gestión avanzada (`AreAdvancedWarehouseManagementProcessesEnabled`) |
| `/hub/warehouses` | `{ warehouseId, name }[]`: los almacenes WMS de la empresa |
| `/hub/warehouses/{id}/summary` | `{ locations, locationsWithStock, aisles, openWorks, building?, distanceStrategy, sortAlgorithm, startLocation? }` (locations = 0: sin plano) |
| `/hub/works?warehouseId=&status=open\|closed\|all&cancelled=1&q=` | `{ total, items: HubWork[] }`. Todos los tipos de work. `open` = Open, InProcess y PendingReview; los cancelados solo con `cancelled=1` (en cerrados o todos). `q` busca en work, carga y pedido |
| `/hub/loads?warehouseId=&status=&cancelled=1&q=` | `{ total, items: { loadId, status, works, openWorks, loadStatus? }[] }`: cargas a partir de sus works en el almacén; `loadStatus` es el de F&O si la entidad BI lo publica |
| `/hub/loads/{id}?warehouseId=&cancelled=1` | `{ loadId, warehouseId, loadStatus?, orders: { orderNumber?, works: { workId, status, stage, stageLocation?, lockedBy?, picks: { lineNum, locationId, itemId?, itemName?, qty, unit?, done }[] }[] }[] }`: la carga por dentro. `stage`: Picking, Staged (mercancía en `stageLocation`), Loaded (work cerrado) o Cancelled |
| `/hub/orders?warehouseId=&q=` | `{ total, items: { orderNumber, customerAccount?, customerName?, status?, requestedShipping?, works, inProcess, loads[] }[] }`: pedidos de venta con works abiertos o en curso en el almacén; `q` busca en pedido y cliente. Cliente y fecha, de `SalesOrderHeaders` (la V2 no responde a tiempo) |
| `/hub/orders/{id}?warehouseId=` | `{ orderNumber, warehouseId, works[] }`: sus works sin los cancelados, con la forma de `/hub/loads/{id}` y `loadId` |
| `/hub/items?stock=1&warehouseId=&q=` | `{ total, items: { itemId, name, unit, qty, locations, warehouses }[] }`: los artículos liberados de la empresa con su disponible físico en los almacenes WMS (0 si no tienen). `stock=1`: solo los que tienen stock; `warehouseId`: solo los que tienen stock en ese almacén |
| `/hub/items/{itemId}/stock?warehouseId=` | `{ itemId, name, unit, qty, openPicks, openPickQty, locations: { warehouseId, locationId, qty, licensePlate?, inventoryStatus?, fno? }[] }` |
| `/hub/locations?warehouseId=&filter=all\|stock\|empty\|picks&zone=&aisle=&profile=&q=` | `{ total, items: { locationId, zone?, aisle?, rack, shelf, bin, profile?, x, y, z, qty, items, itemIds, openPicks }[] }`: las ubicaciones de `WarehouseLocations` con su disponible y sus picks pendientes; `q` busca en la ubicación y en sus artículos |
| `/hub/occupancy?warehouseId=` | `{ warehouse, aisles[], zones[] }`, cada uno `{ key?, total, withStock, withPicks }`: ocupación por pasillo y por zona (key ausente: sin pasillo / sin zona) |
| `/hub/operators` | `{ userId, name? }[]`: los usuarios de la app móvil de la empresa |
| `/hub/picks?warehouseId=&from=&to=&userId=` | `{ total, works, seconds, items: { workId, lineNum, userId?, userName?, closedAt?, locationId, itemId?, itemName?, qty, unit?, seconds, orderNumber?, loadId? }[] }`: líneas de pick cerradas en [from, to) (ISO con zona), más recientes primero; los totales son de todo el filtro |
| `/hub/location-facets?warehouseId=` | `{ total, zones, aisles, profiles }`: valores para los desplegables |
| `/hub/locations/{locationId}?warehouseId=` | `{ location, contents: StockItem[], picks: OpenPick[] }` |
| `/hub/resolve?q=` | `{ kind: work\|load\|location\|item, id, warehouseId?, label }[]`: el buscador del hub |
| `/hub/me` | `{ workId, warehouseId, picks, totalDistance, firstLocation? }[]`: works que el usuario del token tiene cogidos en la app móvil (Locked by → empleado → correo) |

```ts
type HubWork = {
  workId: string; warehouseId: string;
  status: string;          // WHSWorkStatus de F&O
  orderType: string;       // WHSWorkTransType: Sales, TransferIssue, Replenishment…
  orderNumber?: string; loadId?: string;
  lines: number;           // líneas de pick
  startedAt?: string; closedAt?: string;
  lockedBy?: { userId: string; name?: string }; // Locked by y el nombre del empleado
};
```

## Quién decide qué

- **El orden de `lines` lo decide F&O** (paso de ola *Sort picking work lines*). La API y la SPA nunca reordenan.
- `distanceToNext` y `totalDistance`: aritmética con la fórmula de F&O (`|dx| + |dy| + |z1| + |z2|` en city block). En la última línea es la distancia hasta el put.
- `explanation[]`: la genera la API (en mock viene ya en el JSON, generada por `gen_mock.py`).
- Una carga = uno o varios works; `/loads/{loadId}/route` devuelve una `Route` por work, cada una con su orden de F&O.

## `explanation[]` — lo que la API deja listo para el agente

Frases que **describen** el orden que ha dado F&O, nunca lo justifican con otra lógica. Para W-1203 (mock):

- "F&O construye la ruta de las 5 líneas desde el muelle DOCK-01 hacia atrás, eligiendo cada vez la ubicación más cercana, y después la invierte. Por eso el último pick (A-02-0) es el más cercano al muelle."
- "La altura cuenta al subir y al bajar: se suma el nivel de origen y el de destino. A-08-2 está en el nivel 2, así que añade 2 a cada tramo…" (con Z en metros, como CH01, la frase habla de metros; a ras de suelo, dice que la altura no influye)
- "Construcción desde el muelle: desde DOCK-01 lo más cercano era A-02-0 (10,5 m)…; desde A-05-1 lo más cercano era B-06-0 (9,5 m); A-08-2 quedaba a 10,5 m (sin contar la altura habría ganado A-08-2); …"
- "Recorrido total: 53,5 m hasta dejarlo todo en DOCK-01."

El algoritmo y el tipo de distancia no se repiten en `explanation[]`: ya van en la cabecera del panel (`algorithm` / `strategy`). La frase de "Construcción" solo se incluye si el algoritmo es `Fast` y, al recalcularla, sale el mismo orden que ha devuelto F&O. Con eso el agente puede contestar "¿por qué empiezo por la A-08-2?" con datos y sin inventar.

## Deep links que la API devuelve

- `deepLinkWeb`: `https://<swa>/?workId=W-1203&present=1`. En las tarjetas, la URL lleva además `&warehouseId=` y `&company=` (un work de otra empresa saldría como no encontrado). Sin `TEAMS_APP_ID` la tarjeta solo tiene el botón web.
- `deepLinkTeams`: `https://teams.microsoft.com/l/entity/<TEAMS_APP_ID>/<ENTITY_ID>?context=...subEntityId=work:W-1203`

Configurables por app settings `SWA_URL`, `TEAMS_APP_ID`, `TEAMS_ENTITY_ID`.
