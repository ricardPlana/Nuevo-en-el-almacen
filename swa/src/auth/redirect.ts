// Página de vuelta de Entra para ssoSilent y loginPopup (MSAL v5): reenvía la respuesta a la ventana principal.
import { broadcastResponseToMainFrame } from '@azure/msal-browser/redirect-bridge'

broadcastResponseToMainFrame().catch(() => {
  document.body.textContent = 'Puedes cerrar esta ventana.'
})
