import type { Layout } from '../types'
import { theme } from '../theme'

// Por dónde se anda: un carril por pasillo y dos pasillos transversales, delante y detrás de los racks.
// Con plano de nave (layout.aisles), el carril es el centro de cada pasillo de doble cara; sin él, un carril
// junto a cada estantería (x + walkOffset). La ruta se dibuja por aquí, en ángulo recto, como camina una persona.
// Es solo dibujo: el orden y las distancias son los de F&O.

export type P2 = [number, number] // (x, y) de F&O

export type WalkGrid = {
  frontY: number
  backY: number
  lanes: number[] // x de cada carril
  minX: number
  maxX: number
  snap: boolean // true: cada ubicación va al carril más cercano (pasillos de doble cara)
}

export function walkGrid(layout: Layout): WalkGrid {
  if (layout.aisles && layout.aisles.length > 0) {
    const gap = theme.route.crossAisleGap * 0.6
    const lanes = layout.aisles.map((a) => a.x).sort((a, b) => a - b)
    return {
      frontY: Math.min(...layout.aisles.map((a) => a.minY)) - gap,
      backY: Math.max(...layout.aisles.map((a) => a.maxY)) + gap,
      lanes,
      minX: layout.bounds.minX,
      maxX: layout.bounds.maxX,
      snap: true,
    }
  }
  const puts = new Set(layout.putLocations)
  const storage = layout.locations.filter((l) => !puts.has(l.locationId))
  if (storage.length === 0) {
    const b = layout.bounds
    return { frontY: b.minY, backY: b.maxY, lanes: [], minX: b.minX, maxX: b.maxX, snap: false }
  }
  const ys = storage.map((l) => l.y)
  const lanes = [...new Set(storage.map((l) => l.x + theme.route.walkOffset))].sort((a, b) => a - b)
  const xs = storage.map((l) => l.x)
  return {
    frontY: Math.min(...ys) - theme.route.crossAisleGap,
    backY: Math.max(...ys) + theme.route.crossAisleGap,
    lanes,
    minX: Math.min(...xs) - 1,
    maxX: Math.max(...lanes) + 0.5,
    snap: false,
  }
}

export function walkPoint(x: number, y: number, grid: WalkGrid): P2 {
  if (!grid.snap || grid.lanes.length === 0) return [x + theme.route.walkOffset, y]
  const lane = grid.lanes.reduce((best, l) => (Math.abs(l - x) < Math.abs(best - x) ? l : best), grid.lanes[0])
  // Fuera de los pasillos (muelles, staging): se llega en línea recta hasta el punto.
  return Math.abs(lane - x) < 4 ? [lane, y] : [x, y]
}

// Camino en ángulo recto de a a b: si no están en el mismo carril, se cruza por el pasillo
// transversal (delante o detrás) que haga el camino más corto.
export function walkPath(a: P2, b: P2, grid: WalkGrid): P2[] {
  if (Math.abs(a[0] - b[0]) < 0.01) return [a, b]
  const viaFront = Math.abs(a[1] - grid.frontY) + Math.abs(b[1] - grid.frontY)
  const viaBack = Math.abs(a[1] - grid.backY) + Math.abs(b[1] - grid.backY)
  const yc = viaFront <= viaBack ? grid.frontY : grid.backY
  return dedupe([a, [a[0], yc], [b[0], yc], b])
}

export function pathLength(pts: P2[]): number {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return len
}

// Punto y dirección a una distancia s a lo largo del camino.
export function pointAt(pts: P2[], s: number): { p: P2; dir: P2 } {
  let left = s
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1]
    const [bx, by] = pts[i]
    const seg = Math.hypot(bx - ax, by - ay)
    if (seg === 0) continue
    const dir: P2 = [(bx - ax) / seg, (by - ay) / seg]
    if (left <= seg || i === pts.length - 1) {
      const t = Math.min(1, left / seg)
      return { p: [ax + (bx - ax) * t, ay + (by - ay) * t], dir }
    }
    left -= seg
  }
  return { p: pts[pts.length - 1], dir: [0, 1] }
}

function dedupe(pts: P2[]): P2[] {
  return pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 0.01)
}
