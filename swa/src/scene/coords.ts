import type { Layout, Location } from '../types'
import { theme } from '../theme'

// F&O: X/Y en planta, Z = nivel. Three.js: Y arriba. Mapeo (x, y, z) → (x, altura, -y)
// para que, mirando desde el muelle, el pasillo A quede a la izquierda.

export type Vec3 = [number, number, number]

export function boxSize(loc: Location): Vec3 {
  const d = theme.sizes.defaultBox
  return [loc.sizeX ?? d.x, loc.sizeZ ?? d.z, loc.sizeY ?? d.y]
}

// Altura de cada nivel de estantería: la de la nave en F&O si la hay; si no, la de por defecto.
export function levelHeight(layout: Layout): number {
  return layout.levelHeight ?? theme.sizes.levelHeight
}

// Altura a la que empieza el hueco: la real (perfiles apilados) si la API la manda; si no, nivel × altura de nivel.
export function locationBase(loc: Location, lh: number = theme.sizes.levelHeight): number {
  return loc.baseZ ?? loc.level * lh
}

export function locationCenter(loc: Location, lh: number = theme.sizes.levelHeight): Vec3 {
  const [, h] = boxSize(loc)
  return [loc.x, locationBase(loc, lh) + h / 2, -loc.y]
}

export function locationTop(loc: Location, lh: number = theme.sizes.levelHeight): Vec3 {
  const [, h] = boxSize(loc)
  return [loc.x, locationBase(loc, lh) + h, -loc.y]
}

export function floorPoint(x: number, y: number, height = 0): Vec3 {
  return [x, height, -y]
}

export function layoutCenter(layout: Layout): Vec3 {
  const b = layout.bounds
  return [(b.minX + b.maxX) / 2, 0, -(b.minY + b.maxY) / 2]
}

export function layoutSize(layout: Layout): { width: number; depth: number } {
  const b = layout.bounds
  return { width: b.maxX - b.minX, depth: b.maxY - b.minY }
}
