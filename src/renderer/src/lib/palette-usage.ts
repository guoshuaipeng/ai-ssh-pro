import { bumpUsage, type Usage } from '@shared/palette-rank'

const KEY = 'aiss.palette.usage'

export function loadPaletteUsage(store: Pick<Storage, 'getItem'> = localStorage): Usage {
  try {
    const raw = store.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Usage
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function recordPaletteUse(id: string, store: Pick<Storage, 'getItem' | 'setItem'> = localStorage): void {
  const next = bumpUsage(loadPaletteUsage(store), id)
  store.setItem(KEY, JSON.stringify(next))
}
