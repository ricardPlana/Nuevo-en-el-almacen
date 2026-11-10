/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_SOURCE?: 'mock' | 'api'
  readonly VITE_API_URL?: string
  readonly VITE_ENTRA_CLIENT_ID?: string
  readonly VITE_ENTRA_TENANT_ID?: string
  readonly VITE_API_SCOPE?: string
  readonly VITE_TEAMS_APP_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
