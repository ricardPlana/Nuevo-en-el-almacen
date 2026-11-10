import { firstStep, type Route } from '../types'

type Props = {
  route: Route
  step: number
  playing: boolean
  onStep: (step: number) => void // salta a esa parada
  onNext: () => void // anda hasta la parada siguiente
  onPlay: () => void
  onPause: () => void
}

const STRATEGY: Record<string, string> = { CityBlock: 'manzana (city block)', StraightLine: 'línea recta' }
const ALGORITHM: Record<string, string> = { Fast: 'cálculo rápido', Optimized: 'ruta optimizada' }
const STATUS: Record<string, string> = { Open: 'Abierto', InProcess: 'En curso', Closed: 'Cerrado', Cancelled: 'Cancelado' }

const fmt = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 1 })
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })

function duration(from?: string, to?: string): string | null {
  if (!from || !to) return null
  const s = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 1000)
  if (s < 0) return null
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`
}

export default function RoutePanel({ route, step, playing, onStep, onNext, onPlay, onPause }: Props) {
  const last = route.lines.length // índice del muelle
  const first = firstStep(route) // -1 = en la ubicación de inicio
  const atEnd = step >= last
  // Histórico: si F&O tiene la hora real de cada pick, la enseñamos.
  const timed = route.lines.some((l) => l.pickedAt)
  const took = duration(route.startedAt, route.closedAt)
  const realOrder = timed
    ? [...route.lines].filter((l) => l.pickedAt).sort((a, b) => a.pickedAt!.localeCompare(b.pickedAt!)).map((l) => route.lines.indexOf(l) + 1)
    : []
  const followed = realOrder.every((n, i) => n === i + 1)

  return (
    <section className="card route">
      <header className="card-header">
        <h2>Ruta {route.workId}</h2>
        <span className="badge">{STATUS[route.workStatus] ?? route.workStatus}</span>
      </header>
      <p className="meta">
        {route.loadId && <>Carga {route.loadId} · </>}
        {route.lines.length} {route.lines.length === 1 ? 'pick' : 'picks'} · {fmt(route.totalDistance)} m · destino {route.putLocation.locationId}
      </p>
      {route.closedAt && (
        <p className="meta">
          Realizado el {new Date(route.closedAt).toLocaleDateString('es-ES')}
          {took && <> · {took}</>}
          {timed && !followed && <> · se recogió en otro orden: {realOrder.join(' → ')}</>}
        </p>
      )}
      <p className="meta subtle">
        {route.previousPut ? (
          <>La parte anterior ya está hecha: la mercancía está en {route.previousPut}. Queda este tramo.</>
        ) : (
          <>
            Ordenada por F&amp;O: {ALGORITHM[route.algorithm] ?? route.algorithm}, distancia {STRATEGY[route.strategy] ?? route.strategy}
          </>
        )}
      </p>

      <div className="player">
        <button className="step" onClick={() => onStep(Math.max(first, step - 1))} disabled={step <= first} title="Anterior">
          ◀
        </button>
        {playing ? (
          <button className="primary" onClick={onPause}>
            ⏸ Pausa
          </button>
        ) : (
          <button className="primary" onClick={() => (atEnd ? onStep(first) : onPlay())}>
            {atEnd ? '↺ Otra vez' : '▶ Reproducir'}
          </button>
        )}
        <button className="step" onClick={onNext} disabled={atEnd} title="Andar hasta la siguiente parada">
          ▶
        </button>
      </div>

      <table className="lines">
        <thead>
          <tr>
            <th>#</th>
            <th>Ubicación</th>
            <th>Artículo</th>
            <th className="num">Cant.</th>
            <th className="num">{timed ? 'Hora' : '→ m'}</th>
          </tr>
        </thead>
        <tbody>
          {route.startLocation && (
            <tr className={step < 0 ? 'active' : 'done'} onClick={() => onStep(-1)}>
              <td>●</td>
              <td className="mono">{route.startLocation.locationId}</td>
              <td colSpan={3}>Salida</td>
            </tr>
          )}
          {route.lines.map((l, i) => (
            <tr key={l.lineNum} className={i === step ? 'active' : i < step ? 'done' : ''} onClick={() => onStep(i)}>
              <td>{i + 1}</td>
              <td className="mono">{l.locationId}</td>
              <td>{l.itemName}</td>
              <td className="num">
                {fmt(l.qty)} {l.unit}
              </td>
              <td className="num">{timed ? (l.pickedAt ? hhmm(l.pickedAt) : '—') : fmt(l.distanceToNext)}</td>
            </tr>
          ))}
          <tr className={atEnd ? 'active' : ''} onClick={() => onStep(last)}>
            <td>⚑</td>
            <td className="mono">{route.putLocation.locationId}</td>
            <td colSpan={3}>Dejar en el muelle</td>
          </tr>
        </tbody>
      </table>

      {route.explanation.length > 0 && (
        <details className="why">
          <summary>¿Por qué este orden?</summary>
          <ul>
            {route.explanation.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}
