# App registration de Entra ID

**Una sola app, `wh3d-app`**, para todo: pestaña de Teams, SPA, API y llamada de la API a F&O. (El agente de Copilot Studio no usa Entra: entra con API key, ver `copilot-studio/agent.md`.) Es una demo; una app y un secret.

## `wh3d-app`

- **Tipo**: single tenant.
- **Redirect URIs** (*SPA*): `https://<swa-host>/auth-redirect.html`, `http://localhost:5173/auth-redirect.html` (página puente de MSAL v5 para `ssoSilent` y `loginPopup`).
- **Client secret**: uno. Lo usa la API para hablar con F&O.
- **Expose an API**:
  - Application ID URI: `api://<swa-host>/<clientId>` (formato obligatorio para SSO de Teams).
  - Scope: `access_as_user` · consentimiento admin y usuario.
  - **Authorized client applications** (SSO de Teams):
    - `1fec8e78-bce4-4aaf-ab1b-5451cc387264` (Teams desktop/mobile)
    - `5e3ce6c0-2b1f-4285-8d4b-75ee78787346` (Teams web)
- **API permissions**: `User.Read` (Graph, delegated). Concede consentimiento admin.
- Guarda: `clientId`, `tenantId`, `Application ID URI`, secret.

## En F&O

*System administration > Setup > Microsoft Entra applications* → nueva fila: Client Id = `<clientId wh3d-app>`, User ID = un usuario de F&O (crea `WH3DSVC`) con rol **Warehouse manager** (o uno custom con lectura de las entidades que lista `docs/architecture.md`).

La API pide token con client credentials y scope `https://<tu-tier1>.cloudax.dynamics.com/.default`.

## Script

`infra/entra-app.sh` lo hace todo (idempotente): crea `wh3d-app`, App ID URI, scope `access_as_user`, Teams preautorizado, redirect URIs, consentimiento de admin y un secret que **no se imprime** (va a `api/local.settings.json` y, si le pasas `RG`/`SWA`, a los app settings de la SWA).

```bash
SUBSCRIPTION=<id> RG=<rg> SWA=<swa> SWA_HOST=<swa-host> FNO_URL=https://<entorno>.cloudax.dynamics.com ./infra/entra-app.sh
```

## Comprobaciones rápidas

- Token de Teams para la pestaña: `aud` del JWT debe ser `api://<swa-host>/<clientId>` (míralo en `jwt.ms`) y `scp` = `access_as_user`. Si sale `00000003-...` (Graph) el Application ID URI está mal.
- Dentro del iframe de F&O, si MSAL lanza `interaction_in_progress` o `monitor_window_timeout`, es que ha intentado redirect: revisa que solo se use `ssoSilent` + `loginPopup`.
