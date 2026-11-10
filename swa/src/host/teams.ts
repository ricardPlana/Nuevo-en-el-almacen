// teams-js (unos 400 kB) solo se descarga si Teams se identifica; fuera de Teams no va en el paquete.
let lib: Promise<typeof import('@microsoft/teams-js')> | null = null

export function teamsJs(): Promise<typeof import('@microsoft/teams-js')> {
  lib ??= import('@microsoft/teams-js')
  return lib
}

// ¿Estamos dentro de Teams? app.initialize() no resuelve fuera de Teams, así que le damos 2 s.
// Solo lo intentamos si Teams se identifica: el manifest y teams-config ponen ?host=teams, y como red
// el referrer. Dentro del iframe de F&O no se intenta, porque eran 2 s perdidos en cada carga.

let detection: Promise<boolean> | null = null

export function inTeams(): Promise<boolean> {
  detection ??= detect()
  return detection
}

const TEAMS_REFERRER = /^https:\/\/([^/]+\.)?(teams\.microsoft\.com|teams\.cloud\.microsoft)\//

async function detect(): Promise<boolean> {
  const hinted = new URLSearchParams(window.location.search).get('host') === 'teams'
  const framed = window.parent !== window
  if (!hinted && !(framed && TEAMS_REFERRER.test(document.referrer))) return false
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000))
  const init = teamsJs()
    .then(({ app }) => app.initialize())
    .then(
    () => true,
    () => false,
  )
  return Promise.race([init, timeout])
}
