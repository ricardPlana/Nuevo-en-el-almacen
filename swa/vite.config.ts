import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// En local la API (Functions) corre en :7071; en Azure es /api de la propia SWA.
export default defineConfig({
  plugins: [react()],
  // Three.js + drei pesan ~1 MB; es una demo, no hace falta trocear.
  build: {
    chunkSizeWarningLimit: 1600,
    rolldownOptions: {
      // auth-redirect.html: página de vuelta de Entra para MSAL v5 (ssoSilent / loginPopup).
      // hub/index.html: el hub (/hub/), página aparte; no carga three.js ni toca la vista 3D.
      input: { main: 'index.html', authRedirect: 'auth-redirect.html', hub: 'hub/index.html' },
      // three.js y R3F en su propio fichero: cambia poco y el navegador lo guarda aparte del código de la app.
      // MSAL y teams-js salen solos a ficheros aparte porque se importan bajo demanda.
      // React va aparte (y antes): si no, el grupo three se lo lleva como dependencia y el hub tendría que bajarse three.js.
      output: {
        advancedChunks: {
          groups: [
            { name: 'react', test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 2 },
            { name: 'three', test: /[\\/]node_modules[\\/](three|@react-three|three-stdlib)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:7071',
    },
  },
})
