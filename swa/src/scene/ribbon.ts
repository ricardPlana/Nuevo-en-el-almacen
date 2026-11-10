import { BufferGeometry, CanvasTexture, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace } from 'three'
import type { P2 } from './walk'

// Cinta de ruta en el suelo: geometría propia con UV a lo largo del recorrido (v = metros / largo del tile),
// para poder pintar flechas que se repiten y animarlas desplazando la textura. Esquinas redondeadas.

// Redondea las esquinas de una polilínea con arcos (bezier cuadrática) de radio r.
export function roundCorners(pts: P2[], radius: number, samples = 8): P2[] {
  if (pts.length < 3) return pts
  const out: P2[] = [pts[0]]
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1]
    const [cx, cy] = pts[i]
    const [nx, ny] = pts[i + 1]
    const l1 = Math.hypot(cx - px, cy - py)
    const l2 = Math.hypot(nx - cx, ny - cy)
    const r = Math.min(radius, l1 / 2, l2 / 2)
    if (r < 0.05) {
      out.push(pts[i])
      continue
    }
    const a: P2 = [cx - ((cx - px) / l1) * r, cy - ((cy - py) / l1) * r]
    const b: P2 = [cx + ((nx - cx) / l2) * r, cy + ((ny - cy) / l2) * r]
    for (let k = 0; k <= samples; k++) {
      const t = k / samples
      const u = 1 - t
      out.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]])
    }
  }
  out.push(pts[pts.length - 1])
  return out
}

// Malla plana a la altura y: dos vértices por punto (izquierda/derecha), u de 0 a 1, v por longitud.
export function ribbonGeometry(pts: P2[], width: number, y: number, tile: number): BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  let s = 0
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
    const a = pts[Math.max(0, i - 1)]
    const b = pts[Math.min(pts.length - 1, i + 1)]
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
    const tx = (b[0] - a[0]) / len
    const ty = (b[1] - a[1]) / len
    // normal en planta (x, y de F&O); three usa z = -y
    const nx = -ty * (width / 2)
    const ny = tx * (width / 2)
    pos.push(pts[i][0] + nx, y, -(pts[i][1] + ny), pts[i][0] - nx, y, -(pts[i][1] - ny))
    uv.push(0, s / tile, 1, s / tile)
    if (i > 0) {
      const k = i * 2
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

// Textura de flechas (chevrons blancos sobre transparente) que se repite a lo largo de la cinta.
export function arrowTexture(): CanvasTexture {
  const w = 128
  const h = 128
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  // punta hacia arriba del canvas = sentido de avance (v creciente)
  ctx.moveTo(w * 0.5, h * 0.18)
  ctx.lineTo(w * 0.86, h * 0.62)
  ctx.lineTo(w * 0.66, h * 0.62)
  ctx.lineTo(w * 0.5, h * 0.42)
  ctx.lineTo(w * 0.34, h * 0.62)
  ctx.lineTo(w * 0.14, h * 0.62)
  ctx.closePath()
  ctx.fill()
  const t = new CanvasTexture(c)
  t.wrapS = RepeatWrapping
  t.wrapT = RepeatWrapping
  t.colorSpace = SRGBColorSpace
  t.anisotropy = 8
  return t
}
