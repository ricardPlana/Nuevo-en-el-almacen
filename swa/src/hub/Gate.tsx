import { useEffect, useState } from 'react'
import { dataSource } from '../api/client'
import { initAuth, login, type AuthState } from '../auth/auth'
import { applyTheme, initHost, onTeamsThemeChange } from '../host/host'
import Embed, { type EmbedKind } from './Embed'
import Hub from './Hub'

// Tema (Teams o ?theme=) y sesión antes del hub, con las mismas piezas que la vista 3D (sin modificarlas).
export default function Gate() {
  const [auth, setAuth] = useState<AuthState | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (dataSource !== 'api') return
    initHost()
      .then((host) => {
        applyTheme(host.theme)
        if (host.kind === 'teams') onTeamsThemeChange(applyTheme)
        return initAuth()
      })
      .then(setAuth, (e: unknown) => setError(String(e)))
  }, [])

  if (dataSource !== 'api') return <div className="hub-status">El hub lee de F&amp;O: arráncalo con la API (npm run dev:api).</div>
  if (error) return <div className="hub-status">No he podido iniciar sesión: {error}</div>
  if (!auth) return <div className="hub-status">Comprobando sesión…</div>
  if (auth.needsLogin) {
    return (
      <div className="hub-status">
        <p>Para ver los almacenes necesito saber quién eres.</p>
        <button type="button" className="hub-button hub-button--primary" onClick={() => login().then(setAuth, (e: unknown) => setError(String(e)))}>
          Iniciar sesión
        </button>
      </div>
    )
  }
  return embed ? <Embed kind={embed} user={auth.user} /> : <Hub user={auth.user} />
}

// ?embed=location | qr: solo la ficha o solo las etiquetas, para el iframe de F&O (Embed.tsx).
const embedParam = new URLSearchParams(window.location.search).get('embed')
const embed: EmbedKind | null = embedParam === 'location' || embedParam === 'qr' ? embedParam : null
