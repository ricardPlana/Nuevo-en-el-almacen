import type { AccountInfo, PublicClientApplication } from '@azure/msal-browser'
import { inTeams, teamsJs } from '../host/teams'

// Dos estrategias, detectadas al arrancar:
//  - Teams: SSO con teams-js (getAuthToken). El token ya vale para la API (misma app reg).
//  - F&O embebido / standalone: MSAL ssoSilent (loginHint = ?upn=) y, si no, loginPopup desde un botón.
// NUNCA loginRedirect: dentro del iframe de F&O rompe.
// Sin VITE_ENTRA_CLIENT_ID no hay auth (desarrollo local con AUTH_DISABLED=true en la API).
// MSAL (290 kB) se carga solo fuera de Teams, y teams-js solo dentro: ninguno va en el paquete inicial.

export type AuthMode = 'none' | 'teams' | 'msal'
export type AuthState = { mode: AuthMode; needsLogin: boolean; user?: string }

const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID ?? ''
const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID ?? 'organizations'
const scope = import.meta.env.VITE_API_SCOPE ?? ''
const loginHint = new URLSearchParams(window.location.search).get('upn') ?? undefined

let mode: AuthMode = 'none'
let msal: PublicClientApplication | null = null
let msalLib: typeof import('@azure/msal-browser') | null = null

export async function initAuth(): Promise<AuthState> {
  if (!clientId || !scope) return { mode: 'none', needsLogin: false }

  if (await inTeams()) {
    mode = 'teams'
    return { mode, needsLogin: false }
  }

  mode = 'msal'
  msalLib = await import('@azure/msal-browser')
  msal = new msalLib.PublicClientApplication({
    auth: {
      clientId,
      authority: `https://login.microsoftonline.com/${tenantId}`,
      redirectUri: `${window.location.origin}/auth-redirect.html`,
    },
    // localStorage: la sesión la comparten pestañas y aperturas del diálogo de F&O. Con sessionStorage, cada
    // pestaña nueva repetía el ssoSilent (1,2 s) antes de pedir nada.
    cache: { cacheLocation: 'localStorage' },
  })
  await msal.initialize()

  const account = pickAccount(msal.getAllAccounts())
  if (account) {
    msal.setActiveAccount(account)
    return { mode, needsLogin: false, user: account.username }
  }
  try {
    const res = await msal.ssoSilent({ scopes: [scope], loginHint })
    msal.setActiveAccount(res.account)
    return { mode, needsLogin: false, user: res.account.username }
  } catch {
    // Sin sesión reutilizable (o cookies de terceros bloqueadas en el iframe): hará falta el botón.
    return { mode, needsLogin: true }
  }
}

// Lanzar SIEMPRE desde un clic: los navegadores bloquean popups automáticos.
export async function login(): Promise<AuthState> {
  if (!msal) return { mode, needsLogin: false }
  const res = await msal.loginPopup({ scopes: [scope], loginHint })
  msal.setActiveAccount(res.account)
  return { mode, needsLogin: false, user: res.account.username }
}

export async function getToken(): Promise<string | null> {
  if (mode === 'teams') return (await teamsJs()).authentication.getAuthToken()
  if (mode !== 'msal' || !msal) return null
  const account = msal.getActiveAccount()
  if (!account) return null
  try {
    const res = await msal.acquireTokenSilent({ scopes: [scope], account })
    return res.accessToken
  } catch (e) {
    if (msalLib && e instanceof msalLib.InteractionRequiredAuthError) return null
    throw e
  }
}

function pickAccount(accounts: AccountInfo[]): AccountInfo | undefined {
  if (!loginHint) return accounts[0]
  return accounts.find((a) => a.username.toLowerCase() === loginHint.toLowerCase()) ?? accounts[0]
}
