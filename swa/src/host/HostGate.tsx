import { useEffect, useState, type ReactNode } from 'react'
import { applyTheme, initHost, onTeamsThemeChange, type HostInfo } from './host'

// Resuelve el host (Teams o navegador) antes de pintar nada: de ahí salen el tema y el work a enseñar.
export default function HostGate({ children }: { children: (host: HostInfo) => ReactNode }) {
  const [host, setHost] = useState<HostInfo | null>(null)

  useEffect(() => {
    initHost().then((h) => {
      applyTheme(h.theme)
      setHost(h)
      if (h.kind === 'teams') {
        onTeamsThemeChange((theme) => {
          applyTheme(theme)
          setHost((prev) => (prev ? { ...prev, theme } : prev))
        })
      }
    })
  }, [])

  if (!host) return <div className="status">Cargando…</div>
  return children(host)
}
