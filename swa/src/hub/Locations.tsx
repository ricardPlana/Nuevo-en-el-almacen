import { useEffect, useState } from 'react'
import { hubApi, type HubLocation, type LocationFilter } from './api'
import type { HubCtx } from './context'
import { useAsync, useDebounced, usePaged } from './hooks'
import { num } from './labels'
import LocationDetail from './LocationDetail'
import { ErrorBox, Loading, Pager, Pill, Segmented } from './ui'

const FILTERS: { value: LocationFilter; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'stock', label: 'Con stock' },
  { value: 'empty', label: 'Vacías' },
  { value: 'picks', label: 'Con picks' },
]

export default function Locations({ ctx }: { ctx: HubCtx }) {
  const { state, navigate, company, warehouseId, compact } = ctx
  const wh = warehouseId ?? ''
  const facets = useAsync(wh ? `facets|${company}|${wh}` : null, () => hubApi.locationFacets(company, wh))
  const key = `locs|${company}|${wh}|${state.locFilter}|${state.zone}|${state.aisle}|${state.profile}|${state.q}`
  // Lista en columna estrecha: «Ver más» también en PC.
  const list = usePaged<HubLocation>(
    wh ? key : null,
    (skip, top) => hubApi.locations(company, wh, state.locFilter, state.zone, state.aisle, state.profile, state.q, skip, top),
    0,
    state.size,
    true,
  )

  const [text, setText] = useState(state.q)
  const q = useDebounced(text.trim())
  useEffect(() => {
    if (q !== state.q) navigate({ q, page: 0 }, true)
  }, [q, state.q, navigate])

  const showList = !compact || !state.loc
  const f = facets.data

  return (
    <div className="hub-page hub-items">
      {showList && (
        <section aria-label="Ubicaciones" className="hub-items-list hub-locs-list">
          <div className="hub-title">
            <h1>Ubicaciones de {wh}</h1>
            <p className="hub-hint">{f ? `${num(f.total)} ubicaciones en F&O, con lo que tiene cada una.` : 'Las ubicaciones de F&O, con lo que tiene cada una.'}</p>
          </div>
          <Segmented label="Contenido" value={state.locFilter} options={FILTERS} onChange={(locFilter) => navigate({ locFilter, page: 0 }, true)} />
          {f && (
            <div className="hub-selects">
              <FacetSelect label="Zona" value={state.zone} values={f.zones} onChange={(zone) => navigate({ zone }, true)} />
              <FacetSelect label="Pasillo" value={state.aisle} values={f.aisles} onChange={(aisle) => navigate({ aisle }, true)} />
              <FacetSelect label="Perfil" value={state.profile} values={f.profiles} onChange={(profile) => navigate({ profile }, true)} />
            </div>
          )}
          <label className="hub-field">
            <span className="hub-sr">Buscar ubicación o artículo</span>
            <input type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Buscar: ubicación o artículo" />
          </label>
          {list.total > 0 && !compact && (
            <button type="button" className="hub-button" onClick={() => navigate({ view: 'labels' })}>
              Etiquetas QR de estas {num(list.total)} ubicaciones
            </button>
          )}
          {list.error !== null && <ErrorBox error={list.error} retry={list.retry} />}
          {list.items.length === 0 && list.loading && <Loading />}
          {list.items.length === 0 && !list.loading && list.error === null && <p className="hub-empty">Ninguna ubicación con estos filtros.</p>}
          <ul className="hub-item-buttons">
            {list.items.map((l) => (
              <li key={l.locationId}>
                <button type="button" aria-pressed={l.locationId === state.loc} onClick={() => navigate({ loc: l.locationId })}>
                  <span className="hub-loc-row">
                    <span className="hub-mono hub-strong">{l.locationId}</span>
                    {l.openPicks > 0 && <Pill tone="warn">{l.openPicks} picks</Pill>}
                  </span>
                  <span className="hub-hint">
                    {l.qty > 0 ? `${num(l.qty)} · ${l.itemIds.slice(0, 2).join(', ')}${l.items > 2 ? ` +${l.items - 2}` : ''}` : 'Vacía'}
                    {' · '}
                    {[l.zone, l.aisle ? `pasillo ${l.aisle}` : null, l.profile].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Pager
            compact
            page={0}
            size={state.size}
            total={list.total}
            shown={list.items.length}
            loading={list.loading}
            onPage={() => {}}
            onSize={(size) => navigate({ size }, true)}
            onMore={list.more}
          />
        </section>
      )}
      {state.loc ? (
        <LocationDetail ctx={ctx} locationId={state.loc} />
      ) : (
        !compact &&
        list.total > 0 && (
          <section className="hub-card hub-items-detail hub-empty-detail">
            <p className="hub-hint">Elige una ubicación para ver qué tiene.</p>
          </section>
        )
      )}
    </div>
  )
}

function FacetSelect({ label, value, values, onChange }: { label: string; value: string; values: string[]; onChange: (v: string) => void }) {
  if (values.length === 0) return null
  return (
    <label className="hub-select">
      <span className="hub-hint">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Todos</option>
        {values.map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
    </label>
  )
}

