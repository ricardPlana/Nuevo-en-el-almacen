import { useEffect, useState } from 'react'

// Esquina del 3D: ↻ para volver a leer de F&O (el plano está en caché 5 min en la API); "Pestaña nueva" cuando
// la app va dentro de un iframe (F&O, Teams), porque el iframe de F&O no deja usar la pantalla completa; y
// "Pantalla completa" cuando el navegador lo permite.
// La pestaña nueva abre la misma URL (almacén, empresa, work…); el login entra solo con la sesión de Entra.

const embedded = (() => {
  try {
    return window.self !== window.top
  } catch {
    return true // iframe de otro dominio
  }
})()

export default function ViewActions({ onRefresh, refreshing = false }: { onRefresh?: () => void; refreshing?: boolean }) {
  const [full, setFull] = useState(() => !!document.fullscreenElement)

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  return (
    <div className="view-actions">
      {onRefresh && (
        <button
          className={refreshing ? 'icon spinning' : 'icon'}
          onClick={onRefresh}
          disabled={refreshing}
          title="Volver a leer de Dynamics 365 (plano, stock, ruta y works)"
          aria-label="Actualizar desde Dynamics 365"
        >
          ↻
        </button>
      )}
      {embedded && (
        <button onClick={() => window.open(window.location.href, '_blank', 'noopener')} title="Abrir esta vista en una pestaña nueva del navegador">
          Pestaña nueva ↗
        </button>
      )}
      {document.fullscreenEnabled && (
        <button onClick={toggleFull} title={full ? 'Salir de pantalla completa (Esc)' : 'Ver el almacén a pantalla completa'}>
          {full ? 'Salir de pantalla completa' : 'Pantalla completa'}
        </button>
      )}
    </div>
  )
}
