# Teams — app "Almacén 3D"

Una sola app de Teams con **la pestaña 3D y el bot del agente de Copilot Studio**, para que la persona nueva instale una cosa.

Pestañas personales: **Mapa 3D** (la de siempre, `/?host=teams`, la primera) y **Hub** (`/hub/?host=teams`: empresas, almacenes, works, cargas, artículos y ubicaciones; en el móvil sale en versión compacta). Añadir el Hub no cambia la pestaña Mapa 3D; para verlo en Teams hay que subir el zip otra vez con `APP_VERSION` mayor.

## Pasos

1. `manifest.json` es la **plantilla** (no la edites a mano). Copia `teams.env.example` como `teams.env` y rellena:
   - `TEAMS_APP_ID`: GUID nuevo (`New-Guid` / `uuidgen`). Es también `TEAMS_APP_ID` en la SWA.
   - `SWA_HOST`: host de la SWA.
   - `ENTRA_CLIENT_ID`: clientId de `wh3d-app` (el `webApplicationInfo` se monta solo: `api://<SWA_HOST>/<clientId>`).
   - `BOT_ID`: lo da Copilot Studio al publicar el agente en Teams (*Channels > Microsoft Teams*; o descarga su zip y copia `botId`). **Mientras no lo tengas, déjalo vacío** y la app va sin bot.
2. `python teams/build_package.py` → `teams/build/almacen3d.zip` (manifest + `color.png` 192×192 + `outline.png` 32×32 en la raíz del zip). Valida que no quede ningún `REPLACE-`.
3. Cada vez que vuelvas a subir el zip, sube `APP_VERSION`.
4. Subir: Teams → *Apps > Manage your apps > Upload an app > Upload a custom app* (requiere que el admin permita apps personalizadas: Teams admin center → *Teams apps > Setup policies > Upload custom apps*). Para que lo vea más gente en la demo, súbela como app de la organización desde el admin center.
5. Alternativa con **Microsoft 365 Agents Toolkit** en VS Code: *Create new app > Tab > ... > "Import existing app package"* y luego `Provision` / `Deploy` y F5 para depurar la pestaña con sideload.

## La pestaña dentro de la SPA (hecho en la Tarea 7)

Código en `swa/src/host/`: `teams.ts` (detección con timeout de 2 s), `host.ts` (contexto, `subPageId`, tema, `notifySuccess`), `TeamsConfig.tsx` (`/teams-config`). Fuera de Teams el tema se fuerza con `?theme=dark|light`.

Resumen de lo que hace:

```ts
import * as teams from "@microsoft/teams-js";
await teams.app.initialize();                      // con timeout de 2 s para detectar "no estoy en Teams"
const ctx = await teams.app.getContext();
const sub = ctx.page.subPageId;                    // "work:W-1203" | "load:LD-0042" | "loc:A-05-1"
const token = await teams.authentication.getAuthToken();   // aud = api://<swa-host>/<clientId>
teams.app.notifySuccess();
```

- Tema: `ctx.app.theme` (`default` | `dark` | `contrast`) y `teams.app.registerOnThemeChangeHandler`.
- `teams-config`: página mínima que llama a `teams.pages.config.setConfig({ contentUrl, entityId: "mapa3d" })` y `setValidityState(true)`. Solo hace falta para añadir la pestaña a un canal.

## Deep link desde la Adaptive Card

```
https://teams.microsoft.com/l/entity/<TEAMS_APP_ID>/mapa3d?context=%7B%22subEntityId%22%3A%22work%3AW-1203%22%7D
```

En el nuevo cliente de Teams también funciona `https://teams.cloud.microsoft/l/entity/...`. Usa el primero: redirige.
