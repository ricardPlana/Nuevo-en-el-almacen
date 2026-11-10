import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import AuthGate from './auth/AuthGate.tsx'
import HostGate from './host/HostGate.tsx'

// Solo en /teams-config (y arrastra teams-js): no va en el paquete inicial.
const TeamsConfig = lazy(() => import('./host/TeamsConfig.tsx'))

const isTeamsConfig = window.location.pathname.startsWith('/teams-config')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isTeamsConfig ? (
      <Suspense fallback={null}>
        <TeamsConfig />
      </Suspense>
    ) : (
      <HostGate>
        {(host) => (
          <AuthGate>
            <App host={host} />
          </AuthGate>
        )}
      </HostGate>
    )}
  </StrictMode>,
)
