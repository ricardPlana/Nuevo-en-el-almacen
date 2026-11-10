import { useEffect, useState, type ReactNode } from 'react'
import { dataSource } from '../api/client'
import { initAuth, login, type AuthState } from './auth'

// Antes de pedir datos a la API nos aseguramos de tener sesión. En mock no hace falta.
export default function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState | null>(dataSource === 'mock' ? { mode: 'none', needsLogin: false } : null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (state) return
    initAuth().then(setState, (e: unknown) => setError(String(e)))
  }, [state])

  if (error) return <div className="status">No he podido iniciar sesión: {error}</div>
  if (!state) return <div className="status">Comprobando sesión…</div>
  if (state.needsLogin) {
    const click = () => login().then(setState, (e: unknown) => setError(String(e)))
    return (
      <div className="status">
        <div className="login">
          <p>Para ver la ruta necesito saber quién eres.</p>
          <button className="primary-button" onClick={click}>
            Iniciar sesión
          </button>
        </div>
      </div>
    )
  }
  return children
}
