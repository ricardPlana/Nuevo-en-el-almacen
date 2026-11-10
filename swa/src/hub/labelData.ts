import { hubApi, type HubLocation, type LocationFilter } from './api'

const MAX = 600 // etiquetas por impresión, como mucho

export type LabelFilter = { locFilter: LocationFilter; zone: string; aisle: string; profile: string; q: string }

// Ubicaciones para las etiquetas: las de una lista concreta (?locs=, p. ej. las marcadas en F&O) o las del filtro de
// la lista de ubicaciones, por páginas de 100.
export async function loadLabelLocations(company: string, wh: string, locs: string[] | undefined, filter: LabelFilter): Promise<{ items: HubLocation[]; total: number }> {
  if (locs?.length) {
    const ids = locs.slice(0, MAX)
    const items: HubLocation[] = []
    for (let i = 0; i < ids.length; i += 8) {
      const batch = await Promise.all(ids.slice(i, i + 8).map((id) => hubApi.location(company, wh, id).then((d) => d.location, () => null)))
      items.push(...batch.filter((l): l is HubLocation => l !== null))
    }
    return { items, total: locs.length }
  }
  const items: HubLocation[] = []
  let total = 0
  do {
    const page = await hubApi.locations(company, wh, filter.locFilter, filter.zone, filter.aisle, filter.profile, filter.q, items.length, 100)
    total = page.total
    items.push(...page.items)
    if (page.items.length === 0) break
  } while (items.length < Math.min(total, MAX))
  return { items, total }
}
