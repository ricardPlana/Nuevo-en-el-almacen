import type { SceneMode } from '../theme'
import { targetFromSubPageId, targetFromUrl, type Target } from '../target'
import { inTeams, teamsJs } from './teams'

// Dónde estamos y qué hay que enseñar. En Teams el objetivo llega por subPageId
// ("work:W-1203" | "load:LD-0042" | "loc:A-05-1") y el tema por el contexto.
// Fuera de Teams (F&O, standalone) va en la URL y el tema es claro salvo ?theme=dark.

export type HostInfo = { kind: 'teams' | 'browser'; theme: SceneMode; target: Target }

export async function initHost(): Promise<HostInfo> {
  const forced = themeFromUrl()
  if (await inTeams()) {
    const { app } = await teamsJs()
    const ctx = await app.getContext()
    app.notifySuccess()
    return {
      kind: 'teams',
      theme: forced ?? teamsTheme(ctx.app.theme),
      target: targetFromSubPageId(ctx.page.subPageId) ?? targetFromUrl(),
    }
  }
  return { kind: 'browser', theme: forced ?? 'light', target: targetFromUrl() }
}

export function onTeamsThemeChange(cb: (mode: SceneMode) => void): void {
  void teamsJs().then(({ app }) => app.registerOnThemeChangeHandler((t) => cb(teamsTheme(t))))
}

export function applyTheme(mode: SceneMode): void {
  document.documentElement.dataset.theme = mode
}

function teamsTheme(theme: string | undefined): SceneMode {
  return theme === 'dark' || theme === 'contrast' ? 'dark' : 'light'
}

function themeFromUrl(): SceneMode | null {
  const t = new URLSearchParams(window.location.search).get('theme')
  return t === 'dark' || t === 'light' ? t : null
}
