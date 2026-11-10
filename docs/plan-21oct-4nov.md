# Plan 21 oct → 4 nov

14 días. Dos carriles en paralelo: **código** (VS Code + agente, Tareas del `PROMPT.md`) y **plataforma** (F&O, Azure, Entra, Teams, Copilot Studio). Las fechas de "hito" son innegociables; lo demás se recorta.

| Día | Código (Tareas PROMPT.md) | Plataforma | Hito |
|---|---|---|---|
| **Mié 21** | Tarea 0 (esqueleto) + Tarea 1 (3D mock) | F&O: comprobar versión y feature *spatial location*. Si no está, arrancar actualización/sandbox hoy. `infra/deploy.sh`. | 3D con ubicaciones en local |
| Jue 22 | Tarea 2 (ruta mock, animación) | F&O: ubicaciones de la demo con XYZ + wave template + pedidos (comprobar que el work sale Pick…Pick, Put y que F&O lo reordena). Entra: `wh3d-app`. | **Ruta W-1203 animada en mock** |
| Vie 23 | Tarea 3 + 4 (API mock, SPA contra API). Deploy SWA + Function (mock). | F&O: custom service X++ compilado, Postman OK. | API desplegada en mock |
| Sáb 24 / Dom 25 | (descanso o margen) | Escribir los 3 docs del manual del almacén para el conocimiento del agente. | — |
| Lun 26 | Tarea 5 (auth MSAL + teams-js) | F&O: form extension con WebsiteHostControl apuntando a la SWA (mock). Comprobar `frame-ancestors`. | **SWA visible dentro de F&O** |
| Mar 27 | Tarea 6 (cliente F&O). `MOCK_MODE=false` en Azure. | Secret como app setting. Entra application en F&O. | **Ruta real desde F&O en el 3D** |
| Mié 28 | Tarea 7 (Teams) + Tarea 8 (Adaptive Card) | Teams: manifest, iconos, sideload. Copilot Studio: agente, custom connector (API key), tools, conocimiento. | **Pestaña de Teams con SSO** |
| Jue 29 | Corrección de lo que haya roto el 28 | Agente publicado en Teams, bot dentro de la app "Almacén 3D". Guion de 5 mensajes probado. | **Agente responde y abre el 3D** |
| Vie 30 | Tarea 9 (modo presentación, loaders, errores) | Ensayo completo de las dos demos con cronómetro. | Demo completa end-to-end |
| Sáb 31 / Dom 1 | Slides (problema, arquitectura, lecciones) | **Grabar las dos demos en vídeo** (respaldo). | Vídeos de respaldo listos |
| Lun 2 | Congelar código. Solo fixes de demo. | Ensayo general con alguien delante (Iván) vía Teams, compartiendo pantalla a 1280×720. | Ensayo general |
| Mar 3 | — | Checklist del runbook. Tier-1 encendido, tokens caducados renovados, apps abiertas. | — |
| **Mié 4–Sáb 7** | — | Sesión (el día que te asignen). | 🎤 |

## Reglas de recorte (si vas tarde)

1. Primero cae el aviso por Power Automate (ya está fuera) y la pestaña configurable en canal (solo personal).
2. Después, `GetLoadRoute` (el usuario siempre da el work).
3. Después, el modo presentación (se enseña con los paneles de desarrollo, no pasa nada).
4. **Nunca cae**: 3D con ruta en mock, pestaña de Teams, agente con GetRoute + card. Con esas tres hay sesión aunque F&O no llegue: se cuenta en el bloque de lecciones aprendidas.

## Lo que necesitas pedir a otros esta semana

- Admin del tenant: permitir subir apps personalizadas en Teams (o subirlas por ti al admin center) y consentimiento admin de `wh3d-app`.
- Licencia de Copilot Studio (trial de 30 días vale) en el mismo tenant que Teams.
- Acceso al Tier-1 con la versión adecuada, o un sandbox.
