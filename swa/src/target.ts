// Qué hay que enseñar al arrancar: ?workId= / ?loadId= / ?locationId= / ?warehouseId= (standalone y F&O).
// Embebido en Detalles del trabajo, el work va en el fragmento (#workId=): al cambiar de work en F&O solo cambia
// el fragmento, el iframe no se recarga y la SPA cambia de ruta sin volver a pedir el plano (targetFromHash).
// En Teams llega lo mismo por subPageId: "work:W-1203" | "load:LD-0042" | "loc:A-05-1" | "wh:24" (Tarea 7).
// wh = vista de almacén (stock y trabajo pendiente, sin rutas). Sin objetivo también se abre la vista de almacén.

export type Target = { kind: 'work' | 'load' | 'loc' | 'wh'; id: string } | null

export function targetFromUrl(search: string = window.location.search): Target {
  const fromHash = targetFromHash()
  if (fromHash) return fromHash
  const p = new URLSearchParams(search)
  const work = p.get('workId')
  if (work) return { kind: 'work', id: work }
  const load = p.get('loadId')
  if (load) return { kind: 'load', id: load }
  const loc = p.get('locationId')
  if (loc) return { kind: 'loc', id: loc }
  const wh = p.get('warehouseId')
  if (wh) return { kind: 'wh', id: wh }
  return null
}

export function targetFromHash(hash: string = window.location.hash): Target {
  const work = new URLSearchParams(hash.replace(/^#/, '')).get('workId')
  return work ? { kind: 'work', id: work } : null
}

export function targetFromSubPageId(subPageId: string | undefined): Target {
  if (!subPageId) return null
  const [prefix, ...rest] = subPageId.split(':')
  const id = rest.join(':').trim()
  if (!id) return null
  if (prefix === 'work') return { kind: 'work', id }
  if (prefix === 'load') return { kind: 'load', id }
  if (prefix === 'loc') return { kind: 'loc', id }
  if (prefix === 'wh') return { kind: 'wh', id }
  return null
}
