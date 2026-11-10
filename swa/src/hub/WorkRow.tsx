import type { LoadWork } from './api'
import type { HubCtx } from './context'
import { num, workStage } from './labels'
import { Pill } from './ui'

// Un work dentro de una carga o de un pedido: en qué punto va, picks, quién lo tiene y qué recoger.
export default function WorkRow({ ctx, work: w, warehouseId, showLoad = false }: { ctx: HubCtx; work: LoadWork; warehouseId: string; showLoad?: boolean }) {
  const stage = workStage(w.stage, w.stageLocation)
  const done = w.picks.filter((p) => p.done).length
  return (
    <div className="hub-load-work">
      <span className="hub-mono hub-strong">{w.workId}</span>
      <span>
        <Pill tone={stage.tone}>{stage.label}</Pill>
      </span>
      <span className="hub-hint">
        {done} de {w.picks.length} picks
      </span>
      <span className="hub-hint">
        {showLoad && w.loadId ? `Carga ${w.loadId} · ` : ''}
        {w.lockedBy ? `Cogido por ${w.lockedBy.name ?? w.lockedBy.userId}` : 'Sin coger'}
      </span>
      <button type="button" className="hub-button hub-button--ghost" onClick={() => ctx.open3d('work', w.workId, warehouseId)}>
        Ver ruta →
      </button>
      {w.picks.length > 0 && (
        <ul className="hub-load-picks">
          {w.picks.map((p) => (
            <li key={p.lineNum} className={p.done ? 'hub-pick-done' : undefined} title={p.done ? 'Ya recogido' : undefined}>
              <span className="hub-mono">{p.locationId}</span> · {p.itemName ?? 'Varios artículos'} · {num(p.qty)} {p.unit}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
