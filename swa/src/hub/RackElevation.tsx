import { useMemo } from 'react'
import { theme } from '../theme'
import type { Layout } from '../types'

const AROUND = 2 // columnas a cada lado de la de la ubicación

// Alzado: la estantería de la ubicación vista desde el pasillo, solo su columna y las de al lado (la estantería entera
// mide mucho más de largo que de alto y no se vería nada). Cada hueco a su altura real (baseZ y alto del perfil, como
// en el 3D; sin ellos, nivel × altura de nivel).
export default function RackElevation({ layout, locationId, label }: { layout: Layout; locationId: string; label: string }) {
  const view = useMemo(() => {
    const sel = layout.locations.find((l) => l.locationId === locationId)
    if (!sel) return null
    const lh = layout.levelHeight ?? theme.sizes.levelHeight
    // La misma cara de estantería: misma X en el dibujo.
    const face = layout.locations.filter((l) => Math.abs(l.x - sel.x) < 0.01)
    const ys = [...new Set(face.map((l) => l.y))].sort((a, b) => a - b)
    const i = ys.indexOf(sel.y)
    const from = Math.max(0, Math.min(i - AROUND, ys.length - (2 * AROUND + 1)))
    const shown = new Set(ys.slice(from, from + 2 * AROUND + 1))
    const cells = face
      .filter((l) => shown.has(l.y))
      .map((l) => ({ id: l.locationId, y: l.y, w: l.sizeY ?? 1, z0: l.baseZ ?? l.level * lh, h: l.sizeZ ?? lh, bin: l.fno?.bin ?? 0 }))
    const minY = Math.min(...cells.map((c) => c.y - c.w / 2))
    const maxY = Math.max(...cells.map((c) => c.y + c.w / 2))
    const top = Math.max(...cells.map((c) => c.z0 + c.h))
    const columns = [...shown].sort((a, b) => a - b).map((y) => ({ y, bin: cells.find((c) => c.y === y)?.bin ?? 0 }))
    return { cells, minY, maxY, top, columns, sel: cells.find((c) => c.id === locationId)! }
  }, [layout, locationId])

  if (!view) return null
  const { cells, minY, maxY, top, columns, sel } = view
  const w = maxY - minY
  const font = top * 0.05
  const axis = font * 4.2 // sitio para las alturas a la izquierda
  const pad = font
  const sz = (z: number) => top - z // altura hacia arriba
  const fmt = (z: number) => z.toLocaleString('es-ES', { maximumFractionDigits: 2 })

  // Una etiqueta por altura donde empieza un hueco, saltando las que se montarían con la anterior.
  const levels: number[] = []
  for (const z of [...new Set(cells.map((c) => Math.round(c.z0 * 100) / 100))].sort((a, b) => a - b)) {
    if (levels.length === 0 || z - levels[levels.length - 1] >= font * 1.2) levels.push(z)
  }

  return (
    <svg className="hub-plan hub-elevation" viewBox={`${minY - axis} ${-pad} ${w + axis + pad} ${top + 2 * pad + font * 1.6}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      {levels.map((z) => (
        <g key={z}>
          <line x1={minY - font * 0.6} x2={maxY} y1={sz(z)} y2={sz(z)} className="hub-elev-grid" strokeWidth={font * 0.06} />
          <text x={minY - font * 0.9} y={sz(z)} fontSize={font} textAnchor="end" dominantBaseline="middle" className="hub-plan-label">
            {fmt(z)} m
          </text>
        </g>
      ))}
      {cells.map((c) => (
        <rect key={c.id} x={c.y - c.w / 2 + 0.04} y={sz(c.z0 + c.h) + 0.04} width={Math.max(c.w - 0.08, 0.05)} height={Math.max(c.h - 0.08, 0.05)} className="hub-plan-cell" />
      ))}
      <rect x={sel.y - sel.w / 2 + 0.04} y={sz(sel.z0 + sel.h) + 0.04} width={Math.max(sel.w - 0.08, 0.05)} height={Math.max(sel.h - 0.08, 0.05)} className="hub-plan-hit" style={{ strokeWidth: font * 0.1 }}>
        <title>
          {sel.id}: de {fmt(sel.z0)} a {fmt(sel.z0 + sel.h)} m
        </title>
      </rect>
      <line x1={minY - font * 0.6} x2={maxY} y1={top} y2={top} className="hub-elev-floor" strokeWidth={font * 0.12} />
      {columns.map((c) =>
        c.bin > 0 ? (
          <text key={c.y} x={c.y} y={top + font * 1.3} fontSize={font * 0.9} textAnchor="middle" className="hub-plan-label">
            hueco {c.bin}
          </text>
        ) : null,
      )}
    </svg>
  )
}
