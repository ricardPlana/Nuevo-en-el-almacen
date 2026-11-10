import type { ReactNode } from 'react'
import { FnoUnavailableError, NotFoundError, UnauthorizedError } from '../api/client'
import type { Tone } from './labels'
import { PAGE_SIZES } from './nav'

const PATHS: Record<string, ReactNode> = {
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  warehouse: (
    <>
      <path d="M3 21V9l9-5 9 5v12" />
      <path d="M7 21v-8h10v8M7 17h10" />
    </>
  ),
  works: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3" />
    </>
  ),
  items: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9" />,
  stock: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  loads: (
    <>
      <path d="M2 7h11v10H2zM13 10h4l3 3v4h-7" />
      <circle cx="6" cy="18" r="1.8" />
      <circle cx="17" cy="18" r="1.8" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  order: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c1-4 3.6-6 7-6s6 2 7 6" />
    </>
  ),
  cube: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5" />,
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  )
}

export function Pill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`hub-pill hub-pill--${tone}`}>{children}</span>
}

export function Loading({ children = 'Cargando…' }: { children?: ReactNode }) {
  return (
    <p className="hub-hint" role="status">
      {children}
    </p>
  )
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const text =
    error instanceof FnoUnavailableError
      ? 'Dynamics 365 no responde ahora mismo.'
      : error instanceof UnauthorizedError
        ? 'La sesión ya no vale. Recarga la página.'
        : error instanceof NotFoundError
          ? 'No existe en F&O.'
          : 'No he podido leer los datos.'
  return (
    <div className="hub-error" role="alert">
      <span>{text}</span>
      {retry && (
        <button type="button" className="hub-button" onClick={retry}>
          Reintentar
        </button>
      )}
    </div>
  )
}

export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="hub-segmented">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

// PC: «1–25 de 120», páginas y tamaño de página. Móvil: «Ver N más».
export function Pager({ compact, page, size, total, shown, loading, onPage, onSize, onMore }: {
  compact: boolean
  page: number
  size: number
  total: number
  shown: number
  loading: boolean
  onPage: (p: number) => void
  onSize: (s: number) => void
  onMore: () => void
}) {
  if (total === 0) return null
  if (compact) {
    const rest = total - shown
    return (
      <div className="hub-more">
        {rest > 0 && (
          <button type="button" className="hub-button" onClick={onMore} disabled={loading}>
            {loading ? 'Cargando…' : `Ver ${Math.min(size, rest)} más`}
          </button>
        )}
        <span className="hub-hint">
          {shown} de {total}
        </span>
      </div>
    )
  }
  const pages = Math.max(1, Math.ceil(total / size))
  const from = page * size
  const numbers = Array.from({ length: pages }, (_, i) => i).filter((i) => i === 0 || i === pages - 1 || Math.abs(i - page) <= 2)
  return (
    <div className="hub-pager">
      <span className="hub-hint">
        {from + 1}–{Math.min(from + size, total)} de {total}
      </span>
      <div className="hub-pager-controls">
        <label className="hub-inline-label">
          Por página
          <select value={size} onChange={(e) => onSize(Number(e.target.value))}>
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="hub-button" onClick={() => onPage(page - 1)} disabled={page === 0}>
          ← Anterior
        </button>
        {numbers.map((i, k) => (
          <span key={i} className="hub-pager-page">
            {k > 0 && i - numbers[k - 1] > 1 && <span aria-hidden="true">…</span>}
            <button type="button" className="hub-button" aria-current={i === page ? 'page' : undefined} onClick={() => onPage(i)}>
              {i + 1}
            </button>
          </span>
        ))}
        <button type="button" className="hub-button" onClick={() => onPage(page + 1)} disabled={page >= pages - 1}>
          Siguiente →
        </button>
      </div>
    </div>
  )
}
