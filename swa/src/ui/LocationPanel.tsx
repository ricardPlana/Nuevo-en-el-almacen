import type { Location, LocationStock } from '../types'
import { zoneColor } from '../theme'
import { formatQty } from '../format'

type Props = {
  location: Location
  onClose: () => void
  // Vista de almacén: contenido y picks pendientes. undefined = no se está mirando el stock.
  stock?: LocationStock | null
  onOpenWork?: (workId: string) => void
  // true: el almacén se dibuja desde el plano de la nave y X/Y son la posición en ese plano, no coordenadas de F&O.
  planned?: boolean
}

export default function LocationPanel({ location: l, onClose, stock, onOpenWork, planned = false }: Props) {
  const picks = stock?.openPicks ?? []
  const works = [...new Set(picks.map((p) => p.workId))]
  return (
    <section className="card">
      <header className="card-header">
        <span className="zone-dot" style={{ background: zoneColor(l.zone) }} />
        <h2>{l.locationId}</h2>
        <button className="icon-button" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </header>
      {stock !== undefined && (
        <>
          <h3 className="section-title">Contenido</h3>
          {!stock || stock.items.length === 0 ? (
            <p className="hint">Vacía.</p>
          ) : (
            <table className="lines">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th className="num">Cant.</th>
                  <th>Matrícula</th>
                </tr>
              </thead>
              <tbody>
                {stock.items.map((i, k) => (
                  <tr key={k}>
                    <td>
                      <span className="mono">{i.itemId}</span>
                      {i.itemName !== i.itemId && <div className="subtle">{i.itemName}</div>}
                    </td>
                    <td className="num">
                      {formatQty(i.qty)} {i.unit}
                    </td>
                    <td className="mono subtle">{i.licensePlate ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {works.length > 0 && (
            <>
              <h3 className="section-title">Picks pendientes</h3>
              <ul className="work-list">
                {works.map((w) => {
                  const lines = picks.filter((p) => p.workId === w)
                  return (
                    <li key={w}>
                      <button onClick={() => onOpenWork?.(w)} title="Ver la ruta de este work">
                        <span className="mono">{w}</span>
                        <span className="subtle">
                          {lines.map((p) => `${formatQty(p.qty)} ${p.unit} ${p.itemId}`).join(' · ')} · Ver ruta →
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </>
          )}
        </>
      )}
      {l.fno ? (
        <dl className="facts">
          <dt>Zona</dt>
          <dd>{l.fno.zone || '—'}</dd>
          <dt>Pasillo</dt>
          <dd>{l.fno.aisle || '—'}</dd>
          <dt>Rack</dt>
          <dd>{l.fno.rack || '—'}</dd>
          <dt>Estante</dt>
          <dd>{l.fno.shelf || '—'}</dd>
          <dt>Hueco</dt>
          <dd>{l.fno.bin || '—'}</dd>
          <dt>Coordenadas</dt>
          <dd>{l.fno.x || l.fno.y ? `X ${l.fno.x} · Y ${l.fno.y} · Z ${l.fno.z}` : 'Sin coordenadas en F&O'}</dd>
          <dt>Perfil</dt>
          <dd>{l.profile || '—'}</dd>
        </dl>
      ) : (
        <dl className="facts">
          <dt>Zona</dt>
          <dd>{l.zone}</dd>
          <dt>Pasillo</dt>
          <dd>{l.aisle}</dd>
          <dt>Rack</dt>
          <dd>{l.rack}</dd>
          <dt>Nivel</dt>
          <dd>{l.level === 0 ? '0 (suelo)' : l.level}</dd>
          <dt>{planned ? 'Posición en el plano' : 'Coordenadas'}</dt>
          <dd>
            {planned ? `X ${l.x} m · Y ${l.y} m` : `X ${l.x} · Y ${l.y} · Z ${l.z}`}
          </dd>
          <dt>Perfil</dt>
          <dd>{l.profile || '—'}</dd>
        </dl>
      )}
    </section>
  )
}
