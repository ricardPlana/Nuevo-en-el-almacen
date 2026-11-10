// Todos los colores y tamaños del 3D. Nada de colores sueltos en los componentes.

export type SceneMode = 'light' | 'dark'

export const theme = {
  scene: {
    light: {
      background: '#e9edf1',
      presentBackground: '#f3f4f6',
      floor: '#d9dde2',
      lane: '#e8eaee', // carriles de paso pintados en el suelo
      laneEdge: '#f2c94c', // líneas amarillas de seguridad
      label: '#3a4552',
      upright: '#2f5d8a', // postes de estantería (azul industrial)
      beam: '#e8742a', // largueros (naranja)
      box: '#c9a57b', // cartón
      boxV2: '#c99257', // cartón en V2 (la luz de estudio lo aclara: se parte de un tono más cálido)
      boxDim: '#d9cfc2', // cartón fuera de la ruta
    },
    dark: {
      background: '#14171b',
      presentBackground: '#181b1f',
      floor: '#23282e',
      lane: '#2b3138',
      laneEdge: '#a8892f',
      label: '#cfd6de',
      upright: '#3c6d9c',
      beam: '#c7652a',
      box: '#a8875f',
      boxV2: '#a8784a',
      boxDim: '#4a4640',
    },
  },
  // Color de zona: solo para la ficha de la ubicación y los muelles/staging.
  zone: {
    PICK: '#4f8fd6',
    BULK: '#8fa7c2',
    STAGE: '#e2b84d',
    DOCK: '#2fa36b',
    default: '#9aa5b1',
  } as Record<string, string>,
  // Bandas de zona de la nave (tabla de zonas de F&O), por función. Se pintan muy suaves sobre el suelo.
  zoneFunction: {
    Receiving: '#2fa36b',
    PutAway: '#3aa6b9',
    Storage: '#4f8fd6',
    Consolidation: '#e2b84d',
    Shipping: '#2f7d5b',
  } as Record<string, string>,
  zoneBand: { light: 0.12, dark: 0.2 }, // opacidad de la banda
  wall: { light: '#7d8794', dark: '#56606b' },
  // Estantería más alta que la nave (altura libre en F&O): toda en rojo, con cartel.
  rackOver: { upright: '#c92a2a', beam: '#e03131', label: '#c92a2a' },
  location: {
    hover: '#ffd166',
    selected: '#ff7a1a',
    onRoute: '#ff8a2a', // brillo de las cajas que están en la ruta
  },
  route: {
    todo: '#ff8a2a',
    active: '#e03131',
    done: '#a3adb8',
    marker: '#1f4e79',
    markerHalo: '#4f8fd6',
    stem: '#ff8a2a',
    width: 0.34, // ancho de la cinta en metros
    activeWidth: 0.46,
    height: 0.07, // por encima de todo lo pintado en el suelo (theme.floor)
    cornerRadius: 0.9, // esquinas redondeadas de la cinta
    arrowTileRatio: 1.15, // largo de cada flecha respecto al ancho de la cinta
    arrowSpeedActive: 2.4, // m/s a los que avanzan las flechas del tramo activo
    arrowSpeedTodo: 0.6,
    // El picker camina por el pasillo, al lado de la estantería (offset en X).
    walkOffset: 1.5,
    // Distancia de los pasillos transversales (delante y detrás de los racks).
    crossAisleGap: 2,
    // Velocidad del marcador al reproducir (m/s de escena).
    speed: 4.5,
    // Segundos que se queda en cada parada al reproducir (como si cogiera la caja).
    dwell: 1.2,
  },
  // Vista de almacén: mapa de calor de cantidad (relativa a la ubicación más llena).
  // Secuencial de un solo tono (azul). En claro, más cantidad = más oscuro; en oscuro, más claro.
  stock: {
    heat: {
      light: ['#b7d3f6', '#86b6ef', '#3987e5', '#1c5cab', '#0d366b'],
      dark: ['#184f95', '#256abf', '#3987e5', '#86b6ef', '#cde2fb'],
    },
    // Hueco vacío: caja fantasma, solo para poder pincharla.
    ghost: { light: '#7f8c99', dark: '#8c99a6' },
    ghostOpacity: 0.12,
    // Altura mínima de la caja (fracción del hueco) para que una ubicación casi vacía se vea.
    minFill: 0.22,
    pick: '#e03131', // insignia de picks pendientes (mismo rojo que el tramo activo de la ruta)
    tooltip: '#26313d', // fondo de la etiqueta al pasar el ratón
  },
  // Alturas de lo que va pintado en el suelo (m). Separadas 1 cm: con menos, al inclinar la cámara las capas
  // se pelean por el mismo píxel y salen rayas (z-fighting). La ruta va por encima de todas.
  floor: {
    band: 0.01, // banda de color de cada zona
    zoneLine: 0.02, // línea entre zonas
    lane: 0.03, // carriles de paso
    laneEdge: 0.04, // bordes amarillos
    putArea: 0.05, // muelles y staging
    label: 0.06, // nombres pintados en el suelo
  },
  sizes: {
    levelHeight: 1.2,
    defaultBox: { x: 1.2, y: 1.0, z: 1.0 },
    laneWidth: 1.8,
  },
  camera: {
    fov: 45,
    minDistance: 8,
    maxDistance: 60,
    maxPolarAngle: Math.PI / 2.15,
    // Encuadre inicial: dirección (altura, fondo) y márgenes sobre ancho/fondo del almacén.
    elevation: [0.62, 0.82] as const,
    fitWidth: 0.62,
    fitDepth: 0.5,
  },
} as const

export function zoneColor(zone: string): string {
  return theme.zone[zone] ?? theme.zone.default
}

// Color del mapa de calor para una fracción 0..1 (interpolación lineal entre los pasos de la rampa).
export function heatColor(ratio: number, mode: SceneMode): string {
  const ramp = theme.stock.heat[mode]
  const t = Math.min(Math.max(ratio, 0), 1) * (ramp.length - 1)
  const i = Math.min(Math.floor(t), ramp.length - 2)
  const a = hex(ramp[i])
  const b = hex(ramp[i + 1])
  const f = t - i
  return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('')
}

function hex(c: string): number[] {
  return [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16))
}
