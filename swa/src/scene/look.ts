// Aspecto de la escena. V1 = el de siempre. V2 = más cuidado (luz de estudio, sombras suaves, cajas con textura,
// palés de madera, entrada de cámara) a cambio de algo más de GPU; si el equipo no llega, quita las sombras suaves.
// Se elige por URL, con la misma app y la misma SWA: /v2/… (lo que monta F&O con el parámetro activado) o ?look=v2.
// ?look=v1 fuerza la V1 aunque la ruta sea /v2/.
const params = new URLSearchParams(window.location.search)

export const v2 = params.get('look') === 'v1' ? false : window.location.pathname.startsWith('/v2') || params.get('look') === 'v2'
