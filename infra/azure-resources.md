# Recursos de Azure

Lo mínimo para una ponencia: **una Static Web App** con el front y la API (managed functions). Resource group y nombre de la SWA los eliges tú (`RG` y `SWA` en los scripts); región `westeurope` por defecto (`LOCATION`). Coste: 0 € (plan Free).

| Recurso | Nombre | SKU | Para qué |
|---|---|---|---|
| Resource group | `<rg>` (p. ej. `rg-wh3d-app`) | — | Todo junto; bórralo cuando acabes |
| Static Web App | `<swa>` (p. ej. `swa-wh3d`) | Free | Front 3D + API `/api` (.NET 10 isolated, `apiRuntime: dotnet-isolated:10.0`) |

Sin Function App aparte, sin storage, sin Key Vault, sin CORS (front y API comparten dominio). El secreto de F&O va como app setting de la SWA.

## App settings de la SWA (*Environment variables*)

| Setting | Valor |
|---|---|
| `MOCK_MODE` | `true` hasta la Tarea 6; `false` cuando F&O esté conectado |
| `AUTH_DISABLED` | `false` en Azure (solo `true` en local) |
| `ENTRA_TENANT_ID` | tenant |
| `ENTRA_API_AUDIENCE` | `api://<swa-host>/<wh3d-app clientId>` |
| `AGENT_API_KEY` | clave larga aleatoria (la genera `deploy.sh`); la usa el custom connector de Copilot Studio en `x-wh3d-key` |
| `FNO_URL` | `https://<tu-tier1>.cloudax.dynamics.com` (sin barra final) |
| `FNO_CLIENT_ID` | clientId de `wh3d-app` |
| `FNO_CLIENT_SECRET` | secret de `wh3d-app` |
| `SWA_URL` | `https://<swa-host>` |
| `TEAMS_APP_ID` | GUID del manifest de Teams |
| `TEAMS_ENTITY_ID` | `mapa3d` |

En local, los mismos valores van en `api/local.settings.json` (no se sube a git).

## Limitaciones de las managed functions que nos afectan

- **SWA sobrescribe la cabecera `Authorization`**. Por eso: SPA → `X-Wh3d-Token`, agente → `x-wh3d-key`.
- Solo HTTP triggers, ruta fija `/api`. Nos vale.
- Logs: solo si se activa Application Insights en la SWA. Para la demo no hace falta.
- `dotnet-isolated:10.0` sin fecha de fin de soporte (la 8.0 acaba el 10 nov 2026).

## Despliegue

- `infra/deploy.sh` crea el resource group y la SWA, y pone los app settings base. Lo que no crea: la app registration (ver `entra-apps.md`) y la app de Teams.
- Código: un workflow de GitHub Actions (Tarea 0) que compila la API con `dotnet publish` y despliega front + API con `Azure/static-web-apps-deploy` (secret `AZURE_STATIC_WEB_APPS_API_TOKEN`).
- **Sin GitHub (lo que usamos ahora):** `infra/deploy-code.sh` compila SPA (modo api + Entra) y API, y despliega con la SWA CLI 2.1.0 por npx.
  `SUBSCRIPTION=<id> RG=<rg> SWA=<nombre> bash infra/deploy-code.sh` (en PowerShell: `& "C:\Program Files\Git\bin\bash.exe" infra/deploy-code.sh` con las variables en `$env:`).

## Extensiones de VS Code

Azure Static Web Apps · Azure Functions · REST Client · C# Dev Kit · **Microsoft 365 Agents Toolkit** (antes Teams Toolkit; sirve para empaquetar y subir la app de Teams) · Claude Code (o GitHub Copilot).

## Prerrequisitos en tu máquina

- Node 20+, .NET 10 SDK, Azure Functions Core Tools v4, Azure CLI, SWA CLI (`npm i -g @azure/static-web-apps-cli`).
