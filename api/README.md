# api/ — managed functions de la SWA (.NET 10 isolated)

Se despliega dentro de la Static Web App (`/api`), no en un Function App aparte. Solo HTTP triggers.

## Arrancar en local

```bash
cd api
cp local.settings.sample.json local.settings.json   # una vez; no se sube a git
func start --port 7071
curl http://localhost:7071/api/health                # {"status":"ok","mockMode":true,...}
```

O desde VS Code: *Run and Debug* → **WH3D: API + SPA** (arranca Functions y Vite a la vez).

## Cabeceras de auth (Tarea 5)

SWA sobrescribe `Authorization` en las managed functions. Por eso:

- SPA → `X-Wh3d-Token: <token Entra>` (firma del tenant, emisor v1/v2, audiencia = App ID URI o clientId, scope `access_as_user`)
- Agente de Copilot Studio → `x-wh3d-key: <AGENT_API_KEY>`
- `/api/health` es público. `AUTH_DISABLED=true` (solo local) lo desactiva todo.

Lo hace `Auth/AuthMiddleware.cs` + `Auth/EntraTokenValidator.cs`. Prueba rápida:

```bash
curl -i localhost:7071/api/work/W-1203/route                                 # 401 si AUTH_DISABLED=false
curl -i -H "x-wh3d-key: local-dev-key" localhost:7071/api/work/W-1203/route  # 200
```

## Modo F&O (OData)

`MOCK_MODE=false` lee Finance por OData estándar (`FNO_URL`, `FNO_CLIENT_ID`, `FNO_CLIENT_SECRET`, `ENTRA_TENANT_ID`, `FNO_COMPANY=usmf`). La app (`wh3d-app`) tiene que estar dada de alta en *System administration > Setup > Microsoft Entra applications*. La primera consulta tras un rato sin uso puede tardar ~1 min (F&O calentando).

## Settings

Ver `local.settings.sample.json` y `infra/azure-resources.md`. En Azure van en *Environment variables* de la SWA.

## Ficheros

- `Functions/HealthFunction.cs` — `GET /api/health`.
- `openapi.yaml` — contrato; es el que se importa en el custom connector de Copilot Studio.
