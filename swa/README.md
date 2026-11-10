# swa/ — front 3D (Vite + React + TS + Three.js)

## Arrancar en local

```bash
cd swa
npm install
npm run dev          # http://localhost:5173 · datos de /mock/*.json (sin API)
npm run dev:api      # igual, pero contra la API local (/api por proxy a Functions en :7071, ver api/README.md)
npm run build        # dist/ (lo que se despliega)
npm run lint
```

Sin la API arrancada la SPA funciona igual en `VITE_DATA_SOURCE=mock` (lee `/mock/*.json`); solo el aviso de `/api/health` sale en error.
Desde VS Code: *Run and Debug* → **WH3D: API + SPA**.

## Lo que trae el pack

- `staticwebapp.config.json`: en la raíz de `swa/` (el workflow lo indica con `config_file_location`). Fija `apiRuntime: dotnet-isolated:10.0`. Lo importante es `frame-ancestors`: sin él la SWA sale en blanco dentro de F&O y de Teams. Añade tu dominio de Tier-1 si no es `*.cloudax.dynamics.com` / `*.operations.dynamics.com` (una VM de desarrollo local suele ser `usnconeboxax1aos.cloud.onebox.dynamics.com`; en ese caso añade `https://*.onebox.dynamics.com`).
- `public/mock/`:
  - `layout-24.json`: almacén 24 de demo, 3 pasillos (A/B/C) × 8 racks × 3 niveles + staging + 2 muelles. 75 ubicaciones. Coordenadas en metros, city block.
  - `route-W-1203.json`: la ruta estrella de la demo. 5 picks, total 53,5 m, ordenados como lo haría F&O (*Fast calculation*, city block). Caso "raro" de la sesión: `A-08-2` (nivel 2) sale la primera; sin contar la altura iría la tercera.
  - `route-W-1204.json`, `load-LD-0042.json` (dos works de la misma carga), `location-A-05-1.json` y `location-A-08-2.json` (detalle con vecinos y deep links).
- El script que los genera está en el pack como referencia (`gen_mock.py` en la raíz) por si quieres cambiar el almacén o las rutas. Ordena igual que F&O: si F&O real da otro orden, manda F&O.

## Dependencias (las únicas aprobadas en PROMPT.md)

Plantilla `react-ts` de create-vite (React 19, Vite 8, TypeScript 6 en modo `strict`) más:
`three`, `@react-three/fiber`, `@react-three/drei`, `@azure/msal-browser`, `@microsoft/teams-js` y `@types/three`.

## Variables de entorno (`.env.local`)

```
VITE_DATA_SOURCE=mock            # mock | api
VITE_API_URL=/api                # misma SWA; en local el proxy de Vite lo manda a :7071
# Sin VITE_ENTRA_CLIENT_ID no hay login (local, con AUTH_DISABLED=true en la API).
VITE_ENTRA_CLIENT_ID=            # app reg wh3d-app
VITE_ENTRA_TENANT_ID=
VITE_API_SCOPE=api://REPLACE-swa-host/REPLACE-client-id/access_as_user
VITE_TEAMS_APP_ID=
```
