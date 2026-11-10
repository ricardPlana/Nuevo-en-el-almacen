# Power Automate: «tu ruta» en Teams

Cuando un operario coge un trabajo en la app móvil de almacén, le llega por chat de Teams una tarjeta con su ruta: paradas en orden, metros y botón «Ver ruta en 3D». La pistola en una mano y el móvil con Teams en la otra.

Dos flujos:

| Flujo | Disparo | Para qué |
|---|---|---|
| **A. Tu ruta al empezar** | Automático, cada 2 minutos | El de verdad. |
| **B. Enviar ruta a…** | Manual (botón) | Probar la tarjeta en Teams ya, sin app móvil. También sirve al responsable para mandar una ruta a alguien. |

## Cómo sabe F&O quién ha cogido el trabajo

El trabajo no se asigna de antemano. Cuando el operario lo coge en la app móvil, F&O rellena **Locked by** en la cabecera del work con su usuario móvil. La API cruza:

| Paso | Entidad de F&O | Campo |
|---|---|---|
| Work → usuario móvil | `WarehouseWorkHeaders` | `WarehouseWorkLockingWarehouseMobileDeviceUserId` (Locked by) |
| Usuario móvil → nº de personal | `WarehouseMobileDeviceUsers` | `WarehouseWorkerPersonnelNumber` |
| Nº de personal → correo | `Workers` | `IdentityEmail` (usuario de Entra) o, si no, `PrimaryContactEmail` |

`GET /api/works/started` hace todo el cruce y devuelve la tarjeta ya montada (`cardJson`), así que el flujo solo tiene que llamar y enviar.

### Lo que hay que tener en F&O (empresa w3d)

1. **Trabajador de almacén** enlazado al empleado de la persona de prueba (su empleado debe tener usuario de F&O con su cuenta de Entra, o un correo de contacto).
2. **Usuario de la app móvil** para ese trabajador, con CH01 como almacén.
3. Coger el trabajo con la app móvil. Comprobar con `minutes=0` que sale (ver abajo).

## Conexión con la API

Dos opciones; las dos usan la clave del agente (`AGENT_API_KEY` de la SWA) en la cabecera `x-wh3d-key`.

- **Conector personalizado** (el mismo del agente de Copilot Studio): vuelve a importar `api/openapi.yaml` para que aparezca la operación `ListStartedWorks`.
- **Acción HTTP**: más rápida de montar. Guarda la clave en una variable de entorno de la solución, no escrita en el flujo.

Las dos son **premium** en Power Automate: el dueño del flujo necesita licencia Premium (o el flujo, una licencia por flujo). La acción de Teams es estándar.

## Flujo A — Tu ruta al empezar

1. **Trigger**: *Recurrence*, cada **2 minutos**.
2. **Acción HTTP** (o `ListStartedWorks` del conector):
   - Método `GET`
   - URI: `https://<swa-host>/api/works/started?company=w3d&warehouseId=CH01&minutes=2`
   - Cabecera: `x-wh3d-key` = la clave
   - `minutes` igual que la recurrencia: cada pasada mira solo los que han empezado desde la anterior.
3. **Parse JSON** con el cuerpo y este esquema:

```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "workId": { "type": "string" },
      "warehouseId": { "type": "string" },
      "workerName": { "type": ["string", "null"] },
      "email": { "type": ["string", "null"] },
      "picks": { "type": "integer" },
      "totalDistance": { "type": "number" },
      "cardJson": { "type": "string" }
    }
  }
}
```

4. **Apply to each** sobre la salida de *Parse JSON*:
   - **Condition**: `email` no está vacío. Si está vacío, el empleado no tiene correo en F&O: la API lo deja en el log como aviso.
   - **Sí** → Microsoft Teams, *Post card in a chat or channel*:
     - Post as: **Flow bot**
     - Post in: **Chat with Flow bot**
     - Recipient: `email`
     - Adaptive Card: `cardJson`

La tarjeta ya lleva el saludo: «Hola Julia, acabas de empezar el trabajo W3D-000006 en CH01. Así es tu recorrido:».

## Flujo B — Enviar ruta a… (manual)

1. **Trigger**: *Manually trigger a flow* con dos entradas de texto: `workId` y `email`.
2. **HTTP** `GET https://<swa-host>/api/work/{workId}/card?company=w3d`, metiendo la entrada `workId` del trigger como contenido dinámico donde pone `{workId}`. Cabecera `x-wh3d-key`.
3. Microsoft Teams, *Post card in a chat or channel*: Flow bot, Chat with Flow bot, Recipient = `email`, Adaptive Card = `@{string(body('HTTP'))}`.

Pruébalo con `W3D-000006` y tu correo: es la misma tarjeta, sin el saludo.

## Comprobar sin flujo

```bash
# Todos los trabajos cogidos ahora mismo, tengan hora de inicio o no
curl -H "x-wh3d-key: <clave>" "https://<swa-host>/api/works/started?company=w3d&minutes=0"
```

Si sale el work con `email` relleno, el flujo A lo enviará en cuanto entre en la ventana de minutos.

## Detalles

- **Sin hora de inicio no se avisa.** La ventana usa la hora de inicio del work en F&O. Si F&O no la pone al coger el trabajo, sino al primer pick, el aviso llega con el primer pick. Lo vemos en la primera prueba real con `minutes=0`.
- **El botón «Ver ruta en 3D»** abre la SWA con el work, el almacén y la empresa. En el móvil se abre en el navegador de Teams y pide iniciar sesión la primera vez. Con la app de Teams publicada (`TEAMS_APP_ID` en la SWA), la tarjeta añade el botón que abre la pestaña de Teams.
- **Solo lectura.** El aviso informa; el trabajo se sigue haciendo en la app móvil.
- **Más adelante**: en lugar de la recurrencia, un *business event* de F&O al coger el trabajo (trigger *When a business event occurs*). Inmediato y sin llamadas cada 2 minutos, pero necesita X++.
