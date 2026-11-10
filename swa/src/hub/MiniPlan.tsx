import { useMemo } from 'react'
import type { Layout } from '../types'

// Plano del almacén visto desde arriba, en 2D (sin three.js): cada columna de ubicaciones es un rectángulo y las de
// `highlight` salen en naranja. Usa la posición del dibujo del plano (la misma que el 3D), no las coordenadas de F&O.
export default function MiniPlan({ layout, highlight, label }: { layout: Layout; highlight?: Set<string>; label: string }) {
  const { cells, aisles, box } = useMemo(() => {
    const puts = new Set(layout.putLocations)
    const byColumn = new Map<string, { x: number; y: number; w: number; h: number; ids: string[]; put: boolean }>()
    for (const l of layout.locations) {
      const key = `${l.x}|${l.y}`
      const c = byColumn.get(key)
      if (c) c.ids.push(l.locationId)
      else byColumn.set(key, { x: l.x, y: l.y, w: l.sizeX ?? 1.2, h: l.sizeY ?? 1, ids: [l.locationId], put: puts.has(l.locationId) })
    }
    const b = layout.building
      ? { minX: 0, minY: 0, maxX: layout.building.length, maxY: layout.building.width }
      : { minX: layout.bounds.minX, minY: layout.bounds.minY, maxX: layout.bounds.maxX, maxY: layout.bounds.maxY }
    return { cells: [...byColumn.values()], aisles: layout.aisles ?? [], box: b }
  }, [layout])

  const w = box.maxX - box.minX
  const h = box.maxY - box.minY
  const pad = Math.max(w, h) * 0.03
  // Y de F&O hacia arriba; en SVG hacia abajo.
  const sy = (y: number) => box.maxY - y
  const hits = cells.filter((c) => c.ids.some((id) => highlight?.has(id)))

  return (
    <svg className="hub-plan" viewBox={`${box.minX - pad} ${-pad} ${w + 2 * pad} ${h + 2 * pad}`} role="img" aria-label={label} preserveAspectRatio="xMidYMid meet">
      <rect x={box.minX} y={0} width={w} height={h} className="hub-plan-floor" rx={Math.max(w, h) * 0.01} />
      {cells.map((c) => (
        <rect key={`${c.x}|${c.y}`} x={c.x - c.w / 2} y={sy(c.y) - c.h / 2} width={c.w} height={c.h} className={c.put ? 'hub-plan-put' : 'hub-plan-cell'} />
      ))}
      {aisles.map((a) => (
        <text key={a.aisleId} x={a.x} y={sy(a.maxY) - Math.max(w, h) * 0.015} className="hub-plan-label" fontSize={Math.max(w, h) * 0.028} textAnchor="middle">
          {a.name}
        </text>
      ))}
      {hits.map((c) => (
        <rect key={`hit|${c.x}|${c.y}`} x={c.x - c.w / 2} y={sy(c.y) - c.h / 2} width={c.w} height={c.h} className="hub-plan-hit">
          <title>{c.ids.filter((id) => highlight?.has(id)).join(', ')}</title>
        </rect>
      ))}
    </svg>
  )
}
