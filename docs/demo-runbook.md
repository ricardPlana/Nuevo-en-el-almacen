# Runbook de la demo

Sesión online por Teams, 60 min, compartiendo pantalla a **1280×720** (el 3D a más resolución se ve pequeño en Teams).

## IDs de demo (rellenar cuando F&O esté listo)

| Cosa | Mock | Real |
|---|---|---|
| Almacén | 24 | 24 |
| Carga | LD-0042 | |
| Work estrella (5 picks) | W-1203 | |
| Work 2 | W-1204 | |
| Ubicación "rara" (nivel 2) | A-08-2 | |
| Ubicación para GetLocation | A-05-1 | |
| Muelle | DOCK-01 | |

## Estructura de la sesión

| Min | Bloque | Pantalla |
|---|---|---|
| 0–7 | El problema: el primer día de alguien nuevo. Lista de work lines vs mapa. | Slides + captura de *Work details* de F&O |
| 7–15 | Qué nos da D365 SCM (XYZ, sort) y qué no. Arquitectura en una slide. | Slides |
| 15–30 | **Demo 1**: F&O → Work details → pestaña Mapa 3D → ruta, animación, caso "raro". | F&O (Tier-1) con la SWA embebida |
| 30–45 | **Demo 2**: Teams → persona nueva → agente → card → 3D. Conocimiento del manual. | Teams (cuenta de prueba "Nuevo/a") |
| 45–53 | Qué ha costado y qué falta. | Slides |
| 53–60 | Q&A | — |

## Demo 1 — F&O (guion)

1. *Warehouse management > Work > All work* → filtrar por W-1203. Mostrar las líneas: "esto es lo que ve alguien nuevo".
2. Pestaña **Mapa 3D**: aparece el almacén con la ruta. Orbitar, señalar el muelle.
3. "Reproducir": el marcador recorre la ruta. Señalar que empieza en A-08-2 (nivel 2, pasillo A) y cruza a C-08-0: "¿por qué no la deja para cuando pasa por la A-05-1?". F&O monta la ruta desde el muelle hacia atrás cogiendo la más cercana; desde A-05-1, A-08-2 está a 10,5 m por la altura y B-06-0 a 9,5 m. Sin la altura habría ganado A-08-2.
4. Cambiar a W-1204 en la lista → el 3D cambia (la URL la monta el X++).
5. Mostrar 10 segundos la configuración del almacén (city block / fast) y el paso de ola. No más.

## Demo 2 — Teams (guion)

Cuenta de prueba (p. ej. `nuevo.almacen@...`) con la app "Almacén 3D" instalada.

1. Chat con el agente: "Me han dado la carga LD-0042, ¿por dónde empiezo?"
2. Lista + card → clic **Ver ruta en 3D** → pestaña con la ruta.
3. Volver al chat: "¿Por qué empiezo por la A-08-2 si está al lado de donde acabo?"
4. "¿Dónde está la A-05-1?"
5. "¿Qué hago si la ubicación está vacía?" (manual).
6. Bonus si hay tiempo: "confirma el pick de la línea 1" → el agente dice que no.

## Respaldos (en orden de uso)

1. **F&O no responde** → `MOCK_MODE=true` en la SWA (*Environment variables*, 30 s) y seguir. Nadie nota la diferencia; se cuenta al final.
2. **Copilot Studio tarda / falla** → vídeo de la Demo 2 (grabado el 31 oct).
3. **Teams de la demo falla** → SWA standalone con `?workId=W-1203&present=1` en el navegador.
4. **Todo falla** → los dos vídeos + slides. Se avisa al principio: "esto es un prototipo y lo enseño en vivo; si se cae, tengo el vídeo".

## Checklist del día (1 h antes)

- [ ] Tier-1 encendido, sesión de F&O abierta en *All work* con el filtro puesto.
- [ ] `GET /api/health` responde `mockMode:false` (o `true` si has decidido ir en mock).
- [ ] Teams con la cuenta de prueba abierto, chat con el agente limpio (nueva conversación).
- [ ] Token de la conexión del custom connector vigente (manda un mensaje de prueba al agente).
- [ ] Vídeos de respaldo abiertos en el reproductor, en pausa.
- [ ] Resolución 1280×720, notificaciones silenciadas, segundo monitor con el guion.
- [ ] Slides en modo presentador.
- [ ] Agua.
