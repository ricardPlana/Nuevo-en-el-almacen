import { useCallback, useEffect, useRef, useState } from 'react'
import type { Page } from './api'

export type Async<T> = { data: T | null; error: unknown; loading: boolean; retry: () => void }

// Carga cuando cambia key (null = no cargar). Una respuesta que llega tarde, de un key anterior, se descarta.
export function useAsync<T>(key: string | null, load: () => Promise<T>): Async<T> {
  const [state, setState] = useState<{ key: string | null; data: T | null; error: unknown }>({ key: null, data: null, error: null })
  const [attempt, setAttempt] = useState(0)
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load
  })
  useEffect(() => {
    if (key === null) return
    let live = true
    loader.current().then(
      (data) => live && setState({ key, data, error: null }),
      (error: unknown) => live && setState({ key, data: null, error }),
    )
    return () => {
      live = false
    }
  }, [key, attempt])
  const fresh = state.key === key
  return {
    data: fresh ? state.data : null,
    error: fresh ? state.error : null,
    loading: key !== null && !fresh,
    retry: useCallback(() => setAttempt((a) => a + 1), []),
  }
}

export type Paged<T> = { items: T[]; total: number; loading: boolean; error: unknown; more: () => void; retry: () => void }

// Listas: en PC, la página `page` (la que dice la URL); en móvil, «Ver más» va añadiendo páginas a lo ya cargado.
export function usePaged<T>(key: string | null, load: (skip: number, top: number) => Promise<Page<T>>, page: number, size: number, compact: boolean): Paged<T> {
  const [extra, setExtra] = useState<{ key: string; items: T[]; loading: boolean; error: unknown }>({ key: '', items: [], loading: false, error: null })
  const pageKey = key === null ? null : compact ? `${key}|${size}` : `${key}|${page}|${size}`
  const first = useAsync(pageKey, () => load(compact ? 0 : page * size, size))
  const loader = useRef(load)
  useEffect(() => {
    loader.current = load
  })

  const own = extra.key === pageKey ? extra.items : []
  const items = [...(first.data?.items ?? []), ...own]
  const more = useCallback(() => {
    if (pageKey === null) return
    const skip = (first.data?.items.length ?? 0) + (extra.key === pageKey ? extra.items.length : 0)
    setExtra((e) => ({ key: pageKey, items: e.key === pageKey ? e.items : [], loading: true, error: null }))
    loader.current(skip, size).then(
      (p) => setExtra((e) => (e.key === pageKey ? { ...e, items: [...e.items, ...p.items], loading: false } : e)),
      (error: unknown) => setExtra((e) => (e.key === pageKey ? { ...e, loading: false, error } : e)),
    )
  }, [pageKey, first.data, extra, size])

  return {
    items,
    total: first.data?.total ?? 0,
    loading: first.loading || (extra.key === pageKey && extra.loading),
    error: first.error ?? (extra.key === pageKey ? extra.error : null),
    more,
    retry: first.retry,
  }
}

// Móvil: ?mobile=1 lo fuerza; si no, pantallas estrechas (o el móvil de Teams, que también es estrecho).
const forced = new URLSearchParams(window.location.search).get('mobile') === '1'
const narrow = '(max-width: 700px)'

export function useCompact(): boolean {
  const [small, setSmall] = useState(() => window.matchMedia(narrow).matches)
  useEffect(() => {
    const mq = window.matchMedia(narrow)
    const on = () => setSmall(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return forced || small
}

// Un texto que se escribe y se aplica al dejar de teclear (para no llamar a F&O en cada letra).
export function useDebounced(value: string, ms = 400): string {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}
