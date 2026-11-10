# Agente de Copilot Studio — "Asistente de almacén"

Agente **solo lectura**: enseña y explica la ruta que ya ha decidido D365 SCM, y abre el mapa 3D. No confirma picks ni cierra work.

## Crear

Copilot Studio → *Create > New agent* → "Skip to configure":

- **Nombre**: Asistente de almacén
- **Orquestación generativa**: activada.
- **Idioma**: Español.
- **Instrucciones** (campo *Instructions*):

```
Eres el asistente de las personas que acaban de entrar a trabajar en el almacén 24.
Tu trabajo es decirles qué tienen que recoger, dónde está cada ubicación, en qué orden ir y por qué, usando siempre los datos de las herramientas. No inventes ubicaciones ni cantidades.

Reglas:
- Si te dan un número de work (W-xxxx) usa GetRoute. Si te dan una carga (LD-xxxx) usa GetLoadRoute. Si te dan una ubicación (p. ej. A-05-1) usa GetLocation.
- Presenta la ruta como una lista numerada en el orden exacto que devuelve la herramienta: "1. A-08-2 · Rodamiento 6204 2RS · 1 ud (14 m hasta la siguiente)". Termina con la distancia total y el muelle de destino.
- Después de dar una ruta, llama a GetRouteCard y muestra la tarjeta para que puedan abrir el mapa 3D.
- El orden lo decide Dynamics 365, no tú. Si preguntan "por qué" un orden, usa solo las frases de "explanation" de GetRoute y explícalas con tus palabras, en 2-3 frases, sin tecnicismos. Idea clave: el sistema monta la ruta desde el muelle hacia atrás, cogiendo cada vez la ubicación más cercana, y la altura cuenta al subir y al bajar. Nunca propongas otro orden.
- Tú no confirmas picks ni cambias nada en el sistema. Si te piden hacerlo, di que eso se hace desde la app móvil de almacén y ofrece enseñar la ruta.
- Para preguntas de procedimiento (qué hacer si una ubicación está vacía, qué es una zona, EPIs, horarios) usa el conocimiento del manual del almacén. Si no está ahí, di a quién preguntar (responsable de turno).
- Respuestas cortas. Están de pie con una tablet.
```

## Tools

### Custom connector desde `api/openapi.yaml`

1. Rellena en el YAML `servers[0].url` con el host de la SWA.
2. Power Apps → *Custom connectors > New custom connector > Import an OpenAPI file*.
3. *Security*: **API Key** · Parameter label `API key` · Parameter name `x-wh3d-key` · Location `Header`. (No OAuth: SWA pisa la cabecera `Authorization` en las managed functions.)
4. *Test*: crea una conexión pegando el valor de `AGENT_API_KEY` y prueba `GetRoute` con `W-1203`.
5. En el agente → *Tools > Add a tool > Connector* → añade `GetRoute`, `GetLoadRoute`, `GetLocation`, `GetRouteCard`. Las descripciones del YAML son lo que el orquestador usa para elegir; ya están escritas pensando en eso.

### Alternativa MCP (solo si te sobra tiempo)

Exponer la API como servidor MCP con transporte **Streamable HTTP** (Copilot Studio no acepta SSE desde agosto 2025) y añadirlo en *Tools > Add a tool > Model Context Protocol*. Para cuatro endpoints el custom connector es más rápido y está más maduro.

## Mostrar la Adaptive Card

La tool `GetRouteCard` devuelve el JSON de la card. Dos formas de enseñarla:

- **Sencilla**: en la tool, en *Response*, marca que la respuesta se muestre al usuario como Adaptive Card (opción "Adaptive card" en la configuración de respuesta de la tool; en orquestación generativa el agente la renderiza).
- **Control total**: un topic "Ver ruta en 3D" con trigger por frases ("ver en 3D", "abre el mapa", "enséñame la ruta") y un nodo *Send a message > Adaptive Card* con el JSON de abajo usando variables del resultado de `GetRoute`.

### Plantilla de la card para el topic

`GET /api/work/{workId}/card` (`api/AdaptiveCards/RouteCard.cs`) ya devuelve la card hecha: Adaptive Card 1.5 con tabla de las 5 primeras líneas (y `FactSet` como fallback), total y los dos botones. Si vas por la opción del topic, esta plantilla con `FactSet` es equivalente:

```json
{
  "type": "AdaptiveCard", "version": "1.5",
  "body": [
    { "type": "TextBlock", "size": "Large", "weight": "Bolder", "text": "Ruta de picking ${workId}" },
    { "type": "TextBlock", "isSubtle": true, "spacing": "None", "text": "Carga ${loadId} · ${lineCount} ubicaciones · ${totalDistance} m · destino ${putLocation}" },
    { "type": "FactSet", "facts": [
      { "title": "1.", "value": "${line1}" }, { "title": "2.", "value": "${line2}" }, { "title": "3.", "value": "${line3}" },
      { "title": "4.", "value": "${line4}" }, { "title": "5.", "value": "${line5}" }
    ]}
  ],
  "actions": [
    { "type": "Action.OpenUrl", "title": "Ver ruta en 3D", "url": "${deepLinkTeams}" },
    { "type": "Action.OpenUrl", "title": "Abrir en el navegador", "url": "${deepLinkWeb}" }
  ]
}
```

## Conocimiento

Sube a una biblioteca de SharePoint `Almacén 24 — Manual` dos o tres documentos cortos (puedes escribirlos tú para la demo):

- *Zonas del almacén 24*: qué es PICK, BULK, STAGE, DOCK; en qué pasillo está cada cosa.
- *Qué hacer si…*: ubicación vacía, artículo dañado, cantidad no coincide, no encuentro la ubicación.
- *Primer día*: EPIs, a quién preguntar, horario de turnos.

Agente → *Knowledge > Add > SharePoint* → URL de la biblioteca. Esto marca "SharePoint + IA" en la sesión con cero código.

## Publicar en Teams

*Channels > Microsoft Teams and Microsoft 365 Copilot* → *Add channel* → *See agent in Teams*. Para meter el bot en la app "Almacén 3D" copia el **App ID del bot** y ponlo en `teams/manifest.json` → `bots[0].botId`. Después, *Availability options > Show to everyone in my org* o distribuye el zip unificado desde el Teams admin center.

## Guion de prueba (los 5 mensajes de la demo)

1. "Me han dado la carga LD-0042, ¿por dónde empiezo?" → lista en orden + card.
2. Clic en "Ver ruta en 3D" → pestaña con la ruta.
3. "¿Por qué empiezo por la A-08-2 si está en el pasillo A, al lado de donde acabo?" → explicación con la construcción desde el muelle y el nivel 2.
4. "¿Dónde está la A-05-1?" → GetLocation + card de ubicación.
5. "¿Qué hago si la ubicación está vacía?" → respuesta del manual.

Prueba también lo que NO debe hacer: "confirma el pick de la línea 1" → te manda a la app móvil.
