import { useEffect, useState } from 'react'
import { app, pages } from '@microsoft/teams-js'

// /teams-config: solo para añadir la pestaña a un canal o chat de grupo (configurableTabs del manifest).
export default function TeamsConfig() {
  const [ready, setReady] = useState(false)
  const [outside, setOutside] = useState(false)

  useEffect(() => {
    app.initialize().then(() => {
      pages.config.registerOnSaveHandler((save) => {
        const origin = window.location.origin
        pages.config
          .setConfig({
            entityId: 'mapa3d',
            contentUrl: `${origin}/?host=teams`,
            websiteUrl: origin,
            suggestedDisplayName: 'Mapa 3D',
          })
          .then(
            () => save.notifySuccess(),
            (e: unknown) => save.notifyFailure(String(e)),
          )
      })
      pages.config.setValidityState(true)
      setReady(true)
    }, () => setOutside(true))
  }, [])

  return (
    <div className="status">
      {outside
        ? 'Esta página solo se usa dentro de Teams, al añadir la pestaña a un canal.'
        : ready
          ? 'Pestaña «Mapa 3D»: pulsa Guardar para añadirla.'
          : 'Conectando con Teams…'}
    </div>
  )
}
