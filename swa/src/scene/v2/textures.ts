import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace } from 'three'

// Texturas de la V2, pintadas en un canvas (nada que descargar). Son blancas de base: se multiplican por el color
// de la caja, así el color de la ruta o del mapa de calor no cambia; solo añaden sombra en los bordes y detalle.
// Una sola instancia de cada una para todas las cajas.

let cardboard: CanvasTexture | null = null
let shade: CanvasTexture | null = null
let pallet: MeshStandardMaterial | null = null

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  draw(ctx, size)
  const t = new CanvasTexture(canvas)
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 4
  return t
}

// Borde más oscuro en cada cara: da volumen sin oclusión ambiental (que costaría una pasada más).
function vignette(ctx: CanvasRenderingContext2D, s: number, strength: number) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, s, s)
  const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s * 0.75)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${strength})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, s, s)
}

// Caja de cartón: bordes sombreados, algo de fibra y una tira de precinto por el centro de cada cara.
export function cardboardTexture(): CanvasTexture {
  cardboard ??= canvasTexture(256, (ctx, s) => {
    vignette(ctx, s, 0.22)
    let seed = 7
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(90,60,30,${0.025 + rnd() * 0.04})`
      ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.fillRect(s * 0.44, 0, s * 0.12, s)
    ctx.fillStyle = 'rgba(0,0,0,0.08)'
    ctx.fillRect(s * 0.44, 0, 2, s)
    ctx.fillRect(s * 0.56 - 2, 0, 2, s)
  })
  return cardboard
}

// Vista de almacén: solo el sombreado de bordes (el color es el dato; nada de precintos encima).
export function shadeTexture(): CanvasTexture {
  shade ??= canvasTexture(128, (ctx, s) => vignette(ctx, s, 0.18))
  return shade
}

// Palé: tablas arriba y abajo y tacos con huecos oscuros entre medias (se ve en los costados).
export function palletMaterial(): MeshStandardMaterial {
  pallet ??= new MeshStandardMaterial({
    roughness: 0.85,
    map: canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#a07a4f'
      ctx.fillRect(0, 0, s, s)
      ctx.fillStyle = '#3b2a1a'
      for (const x of [0.12, 0.62]) ctx.fillRect(s * x, s * 0.3, s * 0.26, s * 0.42)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(0, s * 0.27, s, 3)
      ctx.fillRect(0, s * 0.72, s, 3)
    }),
  })
  return pallet
}
