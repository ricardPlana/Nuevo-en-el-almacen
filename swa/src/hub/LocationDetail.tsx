import { useMemo, useState } from 'react'
import { theme } from '../theme'
import { hubApi } from './api'
import { locationLink, type HubCtx } from './context'
import { useAsync } from './hooks'
import { num } from './labels'
import MiniPlan from './MiniPlan'
import QrCode from './QrCode'
import RackElevation from './RackElevation'
import { ErrorBox, Loading, Pill } from './ui'

// Rack, estante y hueco de F&O; 0 = sin dato.
const part = (n: number) => (n > 0 ? String(n) : '—')
const m = (z: number) => z.toLocaleString('es-ES', { maximumFractionDigits: 2 })

// Ficha de una ubicación. Primero lo que hay dentro (es lo que busca quien escanea el QR de la estantería), luego los
// picks pendientes y al final dónde está. embedded: dentro del diálogo de F&O (sin «Mostrar QR»: allí hay botón QR).
export default function LocationDetail({ ctx, locationId, embedded = false }: { ctx: HubCtx; locationId: string; embedded?: boolean }) {
  const { company, warehouseId, compact } = ctx
  const wh = warehouseId ?? ''
  const detail = useAsync(`loc|${company}|${wh}|${locationId}`, () => hubApi.location(company, wh, locationId))
  const layout = useAsync(`layout|${company}|${wh}`, () => hubApi.layout(company, wh))
  const highlight = useMemo(() => new Set([locationId]), [locationId])
  const [qr, setQr] = useState(false)
  const [copied, setCopied] = useState(false)
  const l = detail.data?.location
  const contents = detail.data?.contents ?? []
  const picks = detail.data?.picks ?? []
  const hasPlan = (layout.data?.locations.length ?? 0) > 0
  const link = locationLink(company, wh, locationId)

  // Altura real del hueco (como en el 3D): base y alto del perfil; sin ellos, nivel × altura de nivel.
  const height = useMemo(() => {
    const loc = layout.data?.locations.find((x) => x.locationId === locationId)
    if (!loc) return null
    const lh = layout.data?.levelHeight ?? theme.sizes.levelHeight
    const z0 = loc.baseZ ?? loc.level * lh
    return { z0, z1: z0 + (loc.sizeZ ?? lh) }
  }, [layout.data, locationId])

  const total = contents.reduce((s, c) => s + c.qty, 0)
  const items = new Set(contents.map((c) => c.itemId)).size
  const unit = new Set(contents.map((c) => c.unit)).size === 1 ? contents[0]?.unit : ''

  return (
    <section aria-label="Detalle de la ubicación" className={`hub-card hub-items-detail${embedded ? ' hub-embedded-detail' : ''}`}>
      {detail.loading && <Loading />}
      {detail.error !== null && <ErrorBox error={detail.error} retry={detail.retry} />}
      {detail.data && l && (
        <>
          <div className="hub-detail-head">
            <div className="hub-loc-title">
              <span className="hub-hint">Ubicación · {wh}</span>
              <h2 className="hub-mono">{l.locationId}</h2>
              <Pill tone={contents.length > 0 ? 'ok' : 'muted'}>
                {contents.length > 0 ? `${items} ${items === 1 ? 'artículo' : 'artículos'} · ${num(total)}${unit ? ` ${unit}` : ''}` : 'Vacía'}
              </Pill>
            </div>
            <div className="hub-actions">
              {!embedded && !compact && (
                <button type="button" className="hub-button" aria-expanded={qr} onClick={() => setQr((v) => !v)}>
                  {qr ? 'Ocultar QR' : 'Mostrar QR'}
                </button>
              )}
              {hasPlan && !compact && (
                <button type="button" className="hub-button hub-button--primary" onClick={() => ctx.open3d('location', l.locationId, wh)}>
                  Ver en 3D
                </button>
              )}
            </div>
          </div>

          {qr && (
            <div className="hub-qr-box">
              <QrCode text={link} label={`QR que abre la ficha de ${l.locationId}`} />
              <div className="hub-qr-text">
                <strong>QR de {l.locationId}</strong>
                <span className="hub-hint">Escaneado con el móvil abre esta ficha. La etiqueta lleva también el código de barras para la app móvil de almacén.</span>
                <div className="hub-actions">
                  <button type="button" className="hub-button" onClick={() => ctx.navigate({ view: 'labels', locs: [l.locationId] })}>
                    Imprimir etiqueta
                  </button>
                  <button
                    type="button"
                    className="hub-button"
                    onClick={() =>
                      navigator.clipboard.writeText(link).then(
                        () => setCopied(true),
                        () => setCopied(false),
                      )
                    }
                  >
                    {copied ? 'Enlace copiado' : 'Copiar enlace'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="hub-section">
            <h3 className="hub-subtitle">{compact ? 'Qué hay' : 'Contenido'}</h3>
            {contents.length === 0 ? (
              <p className={compact ? 'hub-empty' : 'hub-hint'}>Vacía. Ningún artículo con stock disponible.</p>
            ) : compact ? (
              <ul className="hub-cards">
                {contents.map((c) => (
                  <li key={`${c.itemId}|${c.licensePlate ?? ''}|${c.inventoryStatus ?? ''}`} className="hub-card hub-content-card">
                    <span className="hub-content-head">
                      <strong>{c.itemName}</strong>
                      <strong className="hub-content-qty">
                        {num(c.qty)} {c.unit}
                      </strong>
                    </span>
                    <span className="hub-hint">
                      <span className="hub-mono">{c.itemId}</span>
                      {c.licensePlate ? ` · matrícula ${c.licensePlate}` : ''}
                      {c.inventoryStatus ? ` · ${c.inventoryStatus}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="hub-table-box">
                <table className="hub-table">
                  <thead>
                    <tr>
                      <th scope="col">Artículo</th>
                      <th scope="col">Nombre</th>
                      <th scope="col" className="hub-num">
                        Cantidad
                      </th>
                      <th scope="col">Matrícula</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contents.map((c) => (
                      <tr key={`${c.itemId}|${c.licensePlate ?? ''}|${c.inventoryStatus ?? ''}`}>
                        <td>
                          <button type="button" className="hub-link hub-mono" onClick={() => ctx.navigate({ view: 'items', item: c.itemId, itemStock: 'all', q: '', page: 0 })} title="Ver dónde más está">
                            {c.itemId}
                          </button>
                        </td>
                        <td>{c.itemName}</td>
                        <td className="hub-num hub-strong">
                          {num(c.qty)} {c.unit}
                        </td>
                        <td className="hub-mono">{c.licensePlate ?? '—'}</td>
                        <td>{c.inventoryStatus ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {picks.length > 0 && (
            <div className="hub-section">
              <h3 className="hub-subtitle">{compact ? 'Van a coger de aquí' : 'Picks pendientes'}</h3>
              <ul className="hub-list">
                {picks.map((p) => (
                  <li key={`${p.workId}|${p.lineNum}`}>
                    <button type="button" className="hub-row" onClick={() => ctx.open3d('work', p.workId, wh)}>
                      <span className="hub-mono hub-strong">{p.workId}</span>
                      <span className="hub-hint hub-grow">
                        línea {p.lineNum} · {num(p.qty)} {p.unit} de {p.itemId}
                      </span>
                      <span className="hub-tile-cta">Ver ruta →</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="hub-section">
            <h3 className="hub-subtitle">Dónde está</h3>
            <dl className="hub-facts">
              <div>
                <dt>Zona</dt>
                <dd>{l.zone ?? '—'}</dd>
              </div>
              <div>
                <dt>Pasillo</dt>
                <dd>{l.aisle ?? '—'}</dd>
              </div>
              <div>
                <dt>Rack · estante · hueco</dt>
                <dd>
                  {part(l.rack)} · {part(l.shelf)} · {part(l.bin)}
                </dd>
              </div>
              <div>
                <dt>Perfil</dt>
                <dd>{l.profile ?? '—'}</dd>
              </div>
              {height && (
                <div>
                  <dt>Altura</dt>
                  <dd>
                    {m(height.z0)} – {m(height.z1)} m{height.z0 === 0 ? ' (suelo)' : ''}
                  </dd>
                </div>
              )}
              <div>
                <dt>Coordenadas</dt>
                <dd>{l.x || l.y ? `X ${num(l.x)} · Y ${num(l.y)} · Z ${num(l.z)}` : 'Sin coordenadas'}</dd>
              </div>
            </dl>
          </div>

          {hasPlan && layout.data && (
            <div className="hub-views">
              <figure className="hub-figure">
                <RackElevation layout={layout.data} locationId={l.locationId} label={`Estantería de ${l.locationId} vista desde el pasillo, con su altura`} />
                <figcaption className="hub-legend">
                  <span>
                    <i className="hub-swatch hub-swatch--hit" /> {l.locationId}
                  </span>
                  <span>
                    De frente · {l.aisle ? `pasillo ${l.aisle}` : 'su fila'}
                    {l.rack > 0 ? `, rack ${l.rack}` : ''} · altura en m
                  </span>
                </figcaption>
              </figure>
              <figure className="hub-figure">
                <MiniPlan layout={layout.data} highlight={highlight} label={`Plano de ${wh} desde arriba con ${l.locationId} marcada`} />
                <figcaption className="hub-legend">
                  <span>
                    <i className="hub-swatch hub-swatch--hit" /> {l.locationId}
                  </span>
                  <span>Desde arriba · {wh}</span>
                </figcaption>
              </figure>
            </div>
          )}

          {hasPlan && compact && (
            <button type="button" className="hub-button hub-button--primary hub-button--block" onClick={() => ctx.open3d('location', l.locationId, wh)}>
              Ver en 3D
            </button>
          )}
        </>
      )}
    </section>
  )
}
