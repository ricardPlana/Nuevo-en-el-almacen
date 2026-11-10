import { viewUrl } from './context'
import type { OpenKind } from './nav'

// La vista 3D de siempre (la misma URL que abren F&O y Teams), dentro del hub y sin tocarla: un iframe del mismo
// origen, así que la sesión (MSAL en localStorage) y la caché de assets son las mismas. La barra del hub queda encima.
export default function View3D({ company, kind, id, warehouseId, upn, mobile }: {
  company: string
  kind: OpenKind
  id: string
  warehouseId: string
  upn?: string
  mobile: boolean
}) {
  const src = viewUrl(company, kind, id, warehouseId, upn, mobile)
  return <iframe key={src} className="hub-view3d" src={src} title={`Vista 3D · ${id}`} allow="fullscreen" />
}
