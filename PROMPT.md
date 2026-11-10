# Prompt maestro — proyecto WH3D

> Pégalo como primer mensaje en Claude Code / Copilot agent mode dentro del repo. Las secciones `## Tarea N` son para ir pidiéndolas de una en una después ("haz la Tarea 1").

---

Eres mi par de programación para construir **WH3D**, un prototipo que presento en una sesión de 60 minutos en Microsoft 365 Live 2026 (4–7 de noviembre). Trabajo en VS Code sobre este repo. Lee primero `README.md`, `docs/architecture.md` y `docs/api-contract.md`; son la verdad del proyecto y tienen prioridad sobre cualquier suposición tuya.

## Qué es WH3D

Una persona nueva en un almacén gestionado con Dynamics 365 Supply Chain Management (F&O) recibe un *work* de picking: una lista de líneas con ubicaciones. No sabe dónde están. WH3D reconstruye el almacén en 3D, dibuja la ruta que F&O ya ha calculado (las líneas de pick ordenadas por el paso de ola *Sort picking work lines* usando las coordenadas espaciales XYZ de cada ubicación) y la lleva a donde está esa persona:

- **Embebida en F&O** (control `WebsiteHostControl` en el formulario de detalle del work), para el responsable.
- **Como pestaña de Teams** con SSO, para la persona nueva.
- **Un agente de Copilot Studio** publicado en Teams que responde "¿dónde está el material de esta carga?", "¿por qué este orden?" y abre el 3D con la ruta resaltada. El agente **solo lee**.

Es un prototipo para una sesión, no un producto. Prioriza: que funcione, que se vea bien en demo, que sea explicable. No prioriza: cobertura de tests, escalabilidad, i18n.

## Stack (no lo cambies sin preguntarme)

- Todo va en **una sola Azure Static Web App**: el front y la API (managed functions de la SWA). Sin Function App aparte, sin CORS (mismo dominio), un solo workflow de despliegue.
- `swa/`: **Vite + React + TypeScript + Three.js** (`@react-three/fiber` + `@react-three/drei`).
- `api/`: **Azure Functions .NET 10 isolated** (C#, `dotnet-isolated:10.0`), managed functions de la SWA bajo `/api`. Solo HTTP triggers.
- **Cabeceras de auth**: SWA pisa `Authorization` en las managed functions (bug conocido). La SPA manda el token de Entra en **`X-Wh3d-Token`**; el agente de Copilot Studio manda una API key en **`x-wh3d-key`**. Nunca uses `Authorization`.
- Auth: **MSAL** (`@azure/msal-browser`) en la SPA cuando va embebida en F&O o standalone; **`@microsoft/teams-js`** `authentication.getAuthToken()` cuando va en Teams. Una sola app registration de Entra (`wh3d-app`, scope `access_as_user`).
- F&O: la API lee Finance por **OData estándar** con client credentials (`WarehouseWorkHeaders`, `WarehouseWorkLines`, `WarehouseLocations` con XYZ, `Warehouses`, `ReleasedProductsV2`). Sin X++: el custom service de `fno/` queda solo como alternativa de referencia.
- Datos: la API tiene un **modo mock** (`MOCK_MODE=true`) que sirve los JSON de `swa/public/mock/` sin tocar F&O. La SPA también puede ir contra `/mock/*.json` directamente (`VITE_DATA_SOURCE=mock`). **Todo tiene que funcionar en mock antes de conectar nada real.**

## Modelo de datos (resumen; detalle en `docs/api-contract.md`)

- `Layout`: almacén, dimensiones, lista de `Location { locationId, zone, aisle, rack, level, x, y, z, profile }` y `putLocations` (muelles).
- `Route`: `workId`, `loadId`, `warehouseId`, `strategy` (`StraightLine | CityBlock`), `algorithm` (`Fast | Optimized`), `putLocation`, `lines[] { lineNum, locationId, itemId, itemName, qty, unit, x, y, z, distanceToNext }`, `totalDistance`.
- **La ruta la decide F&O**, no nosotros: el paso de ola *Sort picking work lines* reordena (y renumera) las líneas de pick anteriores al primer put de cada work. Se dibuja **en el orden de `lines`**; la última es la más cercana al muelle. Ni la API ni la SPA reordenan nunca. La API solo añade `distanceToNext`/`totalDistance` (aritmética) y `explanation[]` (frases que describen ese orden).
- **Cargas**: una carga (`loadId`) tiene uno o varios works y F&O ordena cada work por separado. `?loadId=` muestra los works de la carga, cada uno con su ruta; no se fusionan en una sola.

## Convenciones

- TypeScript estricto. Componentes funcionales. Nada de clases en React.
- Colores y tamaños del 3D en un único `theme.ts`. Ubicaciones como cajas; la ruta como una polilínea con flechas y numeración; la ubicación activa resaltada; el muelle con un color distinto.
- Toda llamada HTTP de la SPA pasa por `src/api/client.ts` que decide mock vs real y adjunta el token.
- La URL soporta `?workId=` y `?loadId=` y `?locationId=` y `?warehouseId=` (standalone y F&O). En Teams, lo mismo llega por `app.getContext().page.subPageId` con formato `work:W-1203` / `load:LD-0042` / `loc:A-05-1` / `wh:24`.
- **Vista de almacén** (`?warehouseId=`, o sin parámetros): el mismo 3D sin rutas, con el stock disponible por ubicación, huecos vacíos y picks pendientes (`GET /warehouses/{wh}/stock`). Se embebe en el form *Almacenes* de F&O (`fno/WHS3DInventLocation_Extension.xpp`).
- Commits pequeños, un commit por tarea. No instales dependencias que no estén en la lista sin decírmelo.
- Si algo del contrato no cuadra con lo que necesitas, propón el cambio en `docs/api-contract.md` antes de implementarlo.

## Tareas (en este orden)

### Tarea 0 — Esqueleto
Monorepo con `swa/` (Vite React TS, proxy de Vite `/api` → `http://localhost:7071`), `api/` (Functions .NET 10 isolated, un `HealthFunction`), `.vscode/` (launch compound: Functions + Vite), `.github/workflows/` (**un** workflow de SWA con `workflow_dispatch` que compila la API con `dotnet publish` y la despliega como managed functions). `README` de cada parte con los comandos para arrancar en local. `swa/staticwebapp.config.json` y `swa/public/mock/` del pack se quedan tal cual.

### Tarea 1 — 3D en mock
En `swa/`: `Warehouse3D` que carga `/mock/layout-24.json` y pinta suelo, ubicaciones (cajas por nivel), muelles y etiquetas de pasillo. OrbitControls con límites razonables. Click en una ubicación → panel lateral con sus datos. Debe verse bien a 1280×720 (resolución de la demo en Teams).

### Tarea 2 — Ruta en mock
`RouteOverlay` que carga `/mock/route-W-1203.json` y dibuja la polilínea en orden, con número de paso en cada ubicación, flechas de dirección y el tramo activo resaltado. Panel con la lista de líneas (paso, ubicación, artículo, cantidad, distancia al siguiente). Botones "anterior / siguiente / reproducir" que animan un marcador recorriendo la ruta. `?workId=W-1203` en la URL la carga. `?locationId=A-08-2` ilumina esa ubicación sin ruta. `?loadId=LD-0042` muestra los works de la carga con un selector.

### Tarea 3 — API en mock
En `api/`: `GET /api/warehouses/{wh}/layout`, `GET /api/work/{workId}/route`, `GET /api/loads/{loadId}/route`, `GET /api/warehouses/{wh}/locations/{locationId}`, según `api/openapi.yaml`. Con `MOCK_MODE=true` sirven los JSON de `swa/public/mock/` (el `.csproj` los enlaza y los copia a la salida; una sola copia de los ficheros). `locations/{id}` en mock se calcula desde el layout para cualquier ubicación (vecinos + deep links), no solo las que tienen fichero. Sin CORS (mismo dominio). Sin auth todavía.

### Tarea 4 — SPA contra API
`VITE_DATA_SOURCE=api` hace que `client.ts` llame a la API en vez de a `/mock`. Nada visible cambia.

### Tarea 5 — Auth
- API: middleware del isolated worker que valida el token de Entra de la cabecera `X-Wh3d-Token` (`Microsoft.IdentityModel` + metadatos OpenID del tenant) **o** la API key de `x-wh3d-key` (app setting `AGENT_API_KEY`, solo para los endpoints GET que usa el agente). Audience = el Application ID URI (`api://<swa-host>/<clientId>`, acepta también el `clientId` a secas), scope `access_as_user`. En local, `MOCK_MODE=true` y `AUTH_DISABLED=true` para seguir trabajando sin tokens.
- SPA: `auth/` con dos estrategias detectadas en arranque: (a) `teams-js` si `app.initialize()` resuelve en <2 s dentro de Teams; (b) MSAL con `ssoSilent` (loginHint del `?upn=` si viene de F&O) y `loginPopup` como fallback. **Nunca `loginRedirect`**: en un iframe rompe. El popup lo lanza un botón "Iniciar sesión" (los navegadores bloquean popups sin clic).
- Lee `infra/entra-apps.md` para los IDs y scopes.

### Tarea 6 — Cliente F&O en la API (OData)
`FnoClient`: token con client credentials contra `https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token` scope `{FNO_URL}/.default` y consultas `GET {FNO_URL}/data/...?cross-company=true` (empresa: `?company=` si llega en la URL de la SPA, que la reenvía a la API; si no, `FNO_COMPANY`, por defecto `usmf`). Ruta = cabecera + líneas del work en orden de `WorkLineNumber` (solo los Pick anteriores al primer Put; el Put es el destino); coordenadas de `WarehouseLocations`; layout = ubicaciones con XYZ del almacén. Histórico: `GET /api/warehouses/{wh}/works?status=open|closed|all` y hora real de cada pick (`pickedAt`). Credenciales en app settings de la SWA (`FNO_URL`, `FNO_CLIENT_ID`, `FNO_CLIENT_SECRET`). `MOCK_MODE=false` activa este cliente para rutas y cargas; el layout sigue saliendo del mock (las ubicaciones de la demo se crean en F&O con los mismos IDs). Cachea el token. Respeta el orden de `lines` tal cual llega; completa `explanation[]` igual que `gen_mock.py` (la traza desde el muelle solo si el algoritmo es `Fast` y al recalcularla sale el mismo orden que ha devuelto F&O; si no, solo las frases generales). Si F&O lanza "Work no encontrado" → `404 WORK_NOT_FOUND`. Logs (`ILogger`) con el `workId`. `GET /loads/{loadId}/route` llama a `getLoadRoutes` con `{ "_loadId": "..." }` (una ruta por work de la carga, en el orden de F&O).

### Tarea 7 — Teams
Carpeta `teams/`: manifest (copia `teams/manifest.json` del pack y rellena IDs), iconos, zip de la app. La SPA, cuando detecta Teams: `app.notifySuccess()`, lee `subPageId`, aplica tema (claro/oscuro) al fondo del canvas. Añade un `README` con cómo subir la app (Teams admin center → Manage apps → Upload).

### Tarea 8 — Adaptive Card helper
`api/AdaptiveCards/RouteCard.cs`: dado un `Route`, devuelve el JSON de una Adaptive Card 1.5 con título, tabla de 5 primeras líneas, total de distancia y botón `Action.OpenUrl` al deep link de Teams (`https://teams.microsoft.com/l/entity/{TEAMS_APP_ID}/{ENTITY_ID}?context=...`) y otro a la URL standalone. Endpoint `GET /api/work/{workId}/card` que lo devuelve. Copilot Studio lo consumirá.

### Tarea 9 — Pulido demo
Modo "presentación": `?present=1` oculta paneles de desarrollo, agranda etiquetas, fondo neutro. Loader bonito. Error states amables ("no encuentro el work W-9999"). Un `docs/CHANGELOG.md` corto con lo que hay.

Cuando termines cada tarea, dime qué has hecho, cómo lo pruebo y qué no has podido verificar.
