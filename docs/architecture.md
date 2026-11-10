# Arquitectura WH3D

```
 Navegador · Teams · Móvil (QR)         Copilot Studio · Power Automate
              │ sesión Entra                           │ x-wh3d-key
              ▼                                        │
┌───────── Azure Static Web App (una sola, Free) ──────┼───────┐
│ ┌────────────────────┐ X-Wh3d-Token ┌────────────────▼─────┐ │
│ │ Web React + Three  │ ───────────▶ │ /api managed funcs   │ │
│ │ Vista 3D (/)       │ mismo dominio│ .NET 10 isolated     │ │
│ │ Hub (/hub/)        │              │ Solo lectura         │ │
│ └─────────▲──────────┘              └──────────┬───────────┘ │
└───────────┼────────────────────────────────────┼─────────────┘
            │ iframe (Website Host)              │ OData estándar
            │                                    │ client credentials (app reg "wh3d-app")
┌───────────┴────────────────────────────────────▼─────────────┐
│  D365 F&O (Tier-1 demo)                                      │
│  · Extensiones X++: Trabajo, Almacenes, Ubicaciones          │
│  · Campos de nave y zonas (D365_*, InventLocationZones)      │
│  · Spatial location (XYZ) · Paso de ola Sort picking lines   │
└──────────────────────────────────────────────────────────────┘
```

## Componentes

| Componente | Tecnología | Dónde | Notas |
|---|---|---|---|
| Vista 3D | Vite + React + TS + Three.js (r3f) | Azure Static Web App (Free), raíz `/` | Un único build sirve a F&O, Teams y standalone. Detecta el host al arrancar. |
| Hub | React, sin three.js | Misma SWA, `/hub/` | Empresas, almacenes, trabajos, pedidos de venta, cargas, artículos, ubicaciones, ocupación, revisión de operarios y etiquetas QR. Abre la vista 3D en un iframe. `?embed=location` y `?embed=qr`: ficha y etiquetas para los diálogos de F&O. |
| API | Azure Functions .NET 10 isolated | Managed functions de la misma SWA (`/api`) | Solo lectura. Valida el token de Entra (`X-Wh3d-Token`) o la API key (`x-wh3d-key`). Caché del plano, 5 min; el hub cachea algunas lecturas de 2 a 10 min. `MOCK_MODE` sirve JSON estático. |
| Fuente de datos | D365 F&O con *Warehouse spatial location* | VM Tier-1 / sandbox | **F&O decide la ruta** (paso de ola *Sort picking work lines*, un orden por work). La API la lee por **OData estándar** y no la reordena. |
| Canal 1 | F&O: Website Host en diálogos y pestañas | Extensiones X++ de `WHSWorkTable`, `InventLocation` y `WHSLocation` (`fno/`) | La URL la monta el X++, con empresa, almacén y `upn`. |
| Canal 2 | Teams: pestañas Mapa 3D y Hub, y tarjetas | Teams app (manifest) | SSO con `teams-js`. Misma app reg que la API. |
| Canal 3 | Móvil: hub y QR de las etiquetas | Navegador del móvil | Versión compacta por ancho de pantalla o con `&mobile=1`. Login con la cuenta de Microsoft 365. |
| Canal 4 | Copilot Studio | Teams (bot) | Custom connector contra la API (API key en `x-wh3d-key`). Conocimiento: manual del almacén en SharePoint. |
| Canal 5 | Power Automate: aviso «tu ruta» | Flujo programado | Lee `/api/works/started` (API key) y envía la tarjeta por Teams (`power-automate/README.md`). |

> **Estado:** la SWA, la API y las extensiones de F&O están en uso. De Teams, Copilot Studio y Power Automate, aquí está el diseño; su despliegue en el tenant no se ha comprobado desde este repo.

### Lo que lee de F&O

Todo por OData, sin escribir nada: `Warehouses`, `WarehouseLocations`, `WarehouseAisles`, `InventLocationZones`, `WarehouseLocationProfiles`, `WarehouseManagementParametersV2`, `WarehouseWorkHeaders`, `WarehouseWorkLines`, `ProjInventoryOnHand`, `ReleasedProductsV2`, `SalesOrderHeaders`, `WHSLoadTableBiEntities`, `WarehouseMobileDeviceUsers`, `Workers` y `LegalEntities`.

### Lo que hay en F&O

- **Extensiones X++ (`fno/`):** botón «Ruta 3D» en Trabajo; pestaña «Almacén 3D» en Almacenes; botones Información, QR y Ver en 3D en Ubicaciones; clase `WHS3DUrl`.
- **Datos propios:** medidas de la nave y ubicación de inicio (`D365_*` en el almacén), zonas de la nave (`InventLocationZones`) y el parámetro de la vista V2.
- **Sin custom service:** `fno/WHS3DRouteService.xpp` queda como alternativa de referencia. La API no lo usa.

## Flujos de autenticación

Una sola app registration para **todo** (`wh3d-app`: pestaña, SPA, API y acceso a F&O), con `Application ID URI = api://<swa-host>/<clientId>` y scope `access_as_user`. Esto hace que el token SSO que Teams da a la pestaña valga directamente para la API.

> **Ojo**: SWA sobrescribe la cabecera `Authorization` en las managed functions. Por eso el token viaja en `X-Wh3d-Token` y la API key en `x-wh3d-key`.

1. **Teams** → `teams-js` `authentication.getAuthToken()` → token con audience `api://<swa-host>/<clientId>` → cabecera `X-Wh3d-Token` a la API. Requiere pre-autorizar los client IDs de Teams (ver `infra/entra-apps.md`).
2. **Embebida en F&O (iframe)** → MSAL `ssoSilent({ loginHint: upn })` → si falla, `loginPopup`. El login de Entra no se renderiza dentro de un iframe, por eso **nunca `loginRedirect`**. El `upn` lo pone el X++ en la URL.
3. **Standalone y móvil** → MSAL `loginPopup` normal. La sesión queda en `localStorage`.
4. **Copilot Studio y Power Automate → API** → API key en la cabecera `x-wh3d-key` (app setting `AGENT_API_KEY`). Solo da acceso a los GET de lectura. Sin OAuth ni consentimientos.
5. **API → F&O** → client credentials con `wh3d-app` (mismo secret, como app setting), registrada en F&O en *System administration > Setup > Microsoft Entra applications* asociada a un usuario con rol de almacén.

## Iframes: lo que tiene que cuadrar

- SWA `staticwebapp.config.json` → `Content-Security-Policy: frame-ancestors` con los dominios de F&O y Teams (ya en `swa/`).
- Teams tab: `validDomains` del manifest con el host de la SWA.
- F&O: la URL embebida debe ser HTTPS y el dominio no necesita registrarse; si el iframe sale en blanco es `frame-ancestors`.

## Deep links

- Vista 3D (standalone / F&O): `https://<swa>/?workId=W-1203` · `?loadId=LD-0042` · `?locationId=A-05-1` · `?warehouseId=24` (vista de almacén: stock y picks pendientes, sin rutas; también sin parámetros) · `&company=usmf` (empresa de F&O; la pone la extensión X++, si falta se usa `FNO_COMPANY`) · `&present=1` · `&play=1` (arranca la animación sola) · `&theme=dark|light` · `&mobile=1` (panel abajo y plegable) · `&scope=load` (solo esa carga, con los works por pedido; lo pone el hub)
- Hub: `https://<swa>/hub/` · `?company=&warehouseId=&view=works|orders|loads|items|locations|occupancy|operators|warehouses` · `?embed=location&loc=` · `?embed=qr&locs=&print=1`
- Teams: `https://teams.microsoft.com/l/entity/<teamsAppId>/<entityId>?context=%7B%22subEntityId%22%3A%22work%3AW-1203%22%7D`
  (`subEntityId` codificado: `work:W-1203`, `load:LD-0042`, `loc:A-05-1`, `wh:24`). La SPA lo lee en `app.getContext().page.subPageId`.

## Decisiones y por qué

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| API en managed functions de la SWA | Function App independiente | Un solo recurso y un solo despliegue, sin CORS. El problema de `Authorization` se evita con cabeceras propias. Si hiciera falta un Function App, el código es el mismo. |
| .NET 10 isolated | .NET 8 isolated | `dotnet-isolated:8.0` deja de estar soportado en SWA el 10 nov 2026; 10.0 no tiene fecha. |
| API key para el agente y los flujos | OAuth Entra en el connector | El connector manda `Authorization`, que SWA pisa. Solo leen datos de demo. |
| OData estándar | Custom service X++ | Nada que desplegar en F&O para leer: los datos salen de entidades estándar y el orden es el `WorkLineNumber` que deja el sort. |
| Una app reg para todo | Varias apps + OBO + Key Vault | Es una ponencia: un clientId, un secret. El token SSO de Teams ya sirve para la API. |
| La ruta la ordena F&O | Ordenar en la API | Es el mensaje de la sesión: F&O ya calcula la ruta; WH3D solo la enseña y la explica. |
| Mock en SWA y en API | Solo en API | Permite desarrollar el 3D sin la API, y enseñar la demo aunque F&O caiga. |
| Three.js (r3f) | Babylon.js | Ecosistema React más directo. Con las 480 ubicaciones de CH01, el rendimiento se resuelve instanciando las piezas. |
| Hub en página aparte | Dentro de la vista 3D | No carga three.js y no toca la pantalla de la demo. El 3D se abre en un iframe, sin modificarlo. |
| Solo lectura | Agente o hub que confirman picks | Riesgo de demo, y no compites con la app móvil de WMS. Se dice explícitamente en la sesión. |

## Lo que queda fuera (y se cuenta como "siguientes pasos")

- Aviso inmediato con un business event en X++. Hoy, Power Automate consulta cada 2 minutos.
- Tablets en planta, licencias de Teams para operarios, modo offline.
- Planos importados: hoy, el plano sale de las medidas de la nave, las zonas y las coordenadas de F&O.
