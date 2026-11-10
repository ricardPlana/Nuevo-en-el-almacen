# Almacén 3D (WH3D)

**El almacén de Dynamics 365 Supply Chain Management en tres dimensiones**, con la ruta de picking que ya calcula F&O, desde F&O, Teams o el móvil.

Prototipo de la sesión **"Nuevo en el almacén: IA, Teams y un mapa 3D para que el primer día no sea el peor"**, de Ricard Plana y David González en **Microsoft 365 Live 2026** (4–8 de noviembre, online).

- Resumen de la sesión y diapositivas: [survivingdynamics.com](https://www.survivingdynamics.com/es/blog/almacen-3d-dynamics-365-microsoft-365-live-2026/)
- Licencia: [MIT](LICENSE)

> Es un prototipo para una ponencia, no un producto: prioriza que funcione, que se vea bien y que se pueda explicar. Úsalo como punto de partida.

## Qué problema resuelve

F&O sabe exactamente qué hay que recoger: un trabajo de picking es una lista de líneas con ubicaciones como `06-J-10-02`. Para quien lleva años en el almacén, ese código es un sitio; para quien empezó ayer, es un acertijo. WH3D usa los datos que F&O ya guarda (coordenadas XYZ de cada ubicación, perfiles, zonas, trabajos y cargas) para dibujar el almacén y la ruta.

**La ruta la decide F&O, no WH3D.** El paso de ola *Sort picking work lines* ordena las líneas de cada trabajo con las coordenadas espaciales; WH3D solo lee ese orden y lo enseña. La API es de solo lectura: no confirma picks ni mueve stock.

## Qué incluye

| Pieza | Qué hace | Carpeta |
| --- | --- | --- |
| Vista 3D | Nave, estanterías y ubicaciones a escala; ruta de un trabajo o de una carga con animación; vista de almacén con stock y ocupación | `swa/` (React + Three.js) |
| Hub | *¿Qué quieres ver?*: almacenes, trabajos, pedidos de venta, cargas, artículos, ubicaciones, ocupación, revisión de operarios y etiquetas QR | `swa/hub/`, `swa/src/hub/` |
| API | .NET 10 isolated como managed functions de la SWA; lee F&O por OData estándar y tiene modo mock | `api/` |
| Extensiones X++ | Botón *Ruta 3D* en Trabajo, pestaña *Almacén 3D* en Almacenes, *Información / QR / Ver en 3D* en Ubicaciones; campos de nave y zonas | `fno/` |
| Teams | App con pestañas *Mapa 3D* y *Hub* (SSO) y el bot del agente | `teams/` |
| Copilot Studio | Agente de almacén de solo lectura contra la API | `copilot-studio/` |
| Power Automate | Aviso «tu ruta» en Teams cuando un operario empieza un trabajo | `power-automate/` |

La vista 3D, el hub, la API y las extensiones de F&O se usaron en la demo. Para Teams, Copilot Studio y Power Automate el repo contiene el diseño y los pasos; su despliegue en un tenant no se ha automatizado aquí.

## Arquitectura

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
            │                                    │ client credentials
┌───────────┴────────────────────────────────────▼─────────────┐
│  D365 F&O                                                    │
│  · Extensiones X++: Trabajo, Almacenes, Ubicaciones          │
│  · Spatial location (XYZ) · Paso de ola Sort picking lines   │
└──────────────────────────────────────────────────────────────┘
```

Todo cabe en **una Static Web App en el plan Free** y **una app registration** de Entra ID. Detalle, flujos de autenticación y decisiones en [docs/architecture.md](docs/architecture.md); contrato de la API en [docs/api-contract.md](docs/api-contract.md) y [api/openapi.yaml](api/openapi.yaml).

## Probarlo en local, sin Azure ni F&O

Requisitos: Node 20+, .NET 10 SDK y Azure Functions Core Tools v4 (la API es opcional).

```bash
# Solo el front, con los datos de ejemplo de swa/public/mock
cd swa && npm install && npm run dev            # http://localhost:5173

# Front + API en modo mock (en otra terminal)
cd api && cp local.settings.sample.json local.settings.json && func start --port 7071
cd swa && npm run dev:api
```

Prueba `http://localhost:5173/?workId=W-1203` (ruta animada). El hub (`http://localhost:5173/hub/`) lee de la API, así que necesita la segunda opción. En VS Code también vale *Run and Debug* → **WH3D: API + SPA**. Los datos de ejemplo los genera `gen_mock.py`.

## Llevarlo a tu entorno

Necesitas un entorno de F&O 10.0.49 o posterior con la feature **Warehouse spatial location**, una suscripción de Azure y permisos para crear una app registration en Entra ID. El orden importa:

1. **F&O**: coordenadas, plantilla de ola y extensiones X++ → [fno/README.md](fno/README.md).
2. **Azure**: crea la Static Web App → `SUBSCRIPTION=<id> RG=<rg> SWA=<swa> ./infra/deploy.sh` ([infra/azure-resources.md](infra/azure-resources.md)).
3. **Entra ID**: crea la app registration `wh3d-app` → `SWA_HOST=<swa-host> FNO_URL=https://<tu-entorno>.operations.dynamics.com RG=<rg> SWA=<swa> ./infra/entra-app.sh` ([infra/entra-apps.md](infra/entra-apps.md)) y dala de alta en F&O (*Administración del sistema > Configurar > Aplicaciones de Microsoft Entra*).
4. **Código**: `RG=<rg> SWA=<swa> ./infra/deploy-code.sh`, o el workflow `.github/workflows/swa.yml`. Cuando F&O responda, pon `MOCK_MODE=false` en la SWA.
5. **Opcional**: Teams ([teams/README.md](teams/README.md)), Copilot Studio ([copilot-studio/agent.md](copilot-studio/agent.md)) y Power Automate ([power-automate/README.md](power-automate/README.md)).

### Dónde van tus datos

En el repo no hay ningún dato de un entorno real. Donde haga falta el tuyo verás `REPLACE-…` o `<…>`:

| Dato | Dónde se pone | Cómo se obtiene |
| --- | --- | --- |
| Suscripción, resource group y nombre de la SWA | Variables `SUBSCRIPTION`, `RG` y `SWA` al llamar a `infra/*.sh` | Los eliges tú (p. ej. `rg-wh3d-app`, `swa-wh3d`) |
| Host de la SWA (`<swa-host>`) | `fno/WHS3DUrl.xpp` (`SwaBaseUrl`), `api/openapi.yaml` (`servers`), `teams/teams.env` (`SWA_HOST`), URLs de `power-automate/README.md` | Lo imprime `infra/deploy.sh` (`*.azurestaticapps.net`) |
| URL de F&O | `FNO_URL` en `infra/entra-app.sh` | La de tu entorno, sin barra final |
| Empresa de F&O por defecto | App setting `FNO_COMPANY` (por defecto `usmf`) | El `dataAreaId`; la extensión X++ la pasa en la URL |
| Tenant, client ID y secret de `wh3d-app` | App settings de la SWA y `api/local.settings.json` | Los rellena `infra/entra-app.sh`; el secret no se muestra |
| Variables `VITE_*` del front | `swa/.env.local` en local | En Azure las calcula `infra/deploy-code.sh` |
| Clave del agente (`AGENT_API_KEY`) | App setting de la SWA; cabecera `x-wh3d-key` en Copilot Studio y Power Automate | La genera `infra/deploy.sh` |
| ID de la app de Teams y del bot | `teams/teams.env` (copia de `teams.env.example`) y app setting `TEAMS_APP_ID` | GUID nuevo; el del bot lo da Copilot Studio al publicar |
| Token de despliegue | Secret `AZURE_STATIC_WEB_APPS_API_TOKEN` en GitHub (solo si usas el workflow) | `az staticwebapp secrets list …` |
| Dominio de F&O en el iframe | `frame-ancestors` de `swa/staticwebapp.config.json` | Ya incluye `*.dynamics.com`; añade el tuyo si es una VM *onebox* |

`api/local.settings.json`, `teams/teams.env` y `swa/.env.local` están en `.gitignore`: no subas nunca esos ficheros.

Los datos de ejemplo usan la empresa `w3d` y el almacén `CH01` (ChocoFactory) de la demo, y el almacén `24` en el modo mock. Cámbialos por los tuyos en las URLs de ejemplo.

## Estructura

```
api/              API .NET 10 (managed functions de la SWA) + openapi.yaml
swa/              Vista 3D y hub (Vite + React + TypeScript + Three.js), datos mock
fno/              Extensiones X++ y pasos de configuración en F&O
infra/            Scripts az para la SWA, la app registration y el despliegue
teams/            Manifest de la app de Teams y script de empaquetado
copilot-studio/   Instrucciones y herramientas del agente
power-automate/   Flujo del aviso «tu ruta»
tools/            Utilidades para preparar el plano en F&O
docs/             Arquitectura, contrato de la API y notas de la preparación
```

## Cómo se construyó

El prototipo se hizo en dos semanas con un agente de código en VS Code. Se dejan como referencia del proceso:

- [PROMPT.md](PROMPT.md): el prompt inicial y las tareas en orden.
- [docs/plan-21oct-4nov.md](docs/plan-21oct-4nov.md), [docs/demo-runbook.md](docs/demo-runbook.md) y [docs/CHANGELOG.md](docs/CHANGELOG.md): plan, guion de la demo y evolución. Reflejan el estado de cada momento, no el actual.

## Autores

- **Ricard Plana Llaurado**: [survivingdynamics.com](https://www.survivingdynamics.com) · [LinkedIn](https://www.linkedin.com/in/ricardplanallaurado/)
- **David González García**: [LinkedIn](https://www.linkedin.com/in/davidgonzalez-garcia/)
