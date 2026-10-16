/** PNG-7: status chips in a fixed bar, highest priority first. Sync state stays here; the OS tray only carries the product name. */

import { isEngineerLeak } from './product-error'
import { statusGlyph, type SyncPhase } from './sync-vault'

/** Higher renders first (left) so a tight bar keeps the urgent chip. */
export const STATUS_PRIORITY = {
  disconnect: 40,
  broadcast: 30,
  record: 20,
  sync: 10
} as const

export type StatusSlotId = 'disconnect' | 'broadcast' | 'record' | 'sync'

export type StatusSlot = {
  id: StatusSlotId
  glyph: string
  priority: number
  phase?: SyncPhase
  count?: number
  host?: string
  tabId?: string
}

const HOST_PATH = /[\\/]|file:|\.html?\b|\.tsx?\b|node_modules/

/** A host label safe to put in a human sentence. Errors and paths collapse to empty. */
export function statusHostLabel(raw: string): string {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (!name) return ''
  if (isEngineerLeak(name) || HOST_PATH.test(name)) return ''
  return name.slice(0, 64)
}

/**
 * Polish-10: one quiet status phrase for the fixed bar.
 * A live connection count wins. A dropped connection already has its own sentence, so the bar does not also say Ready.
 * Returns null when that sentence should stand alone. Never includes a path or an error string.
 */
export function statusQuietLabel(input: {
  connected: number
  disconnected?: boolean
  locale: 'zh-CN' | 'en'
}): string | null {
  const n = Number.isFinite(input.connected) ? Math.max(0, Math.floor(input.connected)) : 0
  if (n > 0) return input.locale === 'en' ? `${n} connected` : `已连接 ${n}`
  if (input.disconnected) return null
  return input.locale === 'en' ? 'Ready' : '就绪'
}

/** SB-3: one human sentence, PF-5 tone. No IPC channel, stack, or path. */
export function disconnectStatusSentence(host: string, locale: 'zh-CN' | 'en'): string {
  const name = statusHostLabel(host)
  if (locale === 'en') return name ? `The connection to ${name} dropped` : 'The connection dropped'
  return name ? `与 ${name} 的连接已断开` : '连接已断开'
}

export function statusBarSlots(input: {
  syncEnabled: boolean
  phase: SyncPhase
  recording?: boolean
  broadcastCount?: number
  disconnected?: boolean
  host?: string
  tabId?: string
}): { tray: false; slots: StatusSlot[] } {
  const slots: StatusSlot[] = []
  if (input.disconnected) {
    slots.push({
      id: 'disconnect',
      glyph: '',
      priority: STATUS_PRIORITY.disconnect,
      host: statusHostLabel(input.host ?? ''),
      tabId: input.tabId
    })
  }
  const broadcasts = input.broadcastCount ?? 0
  if (broadcasts > 0) {
    slots.push({ id: 'broadcast', glyph: '⇉', priority: STATUS_PRIORITY.broadcast, count: broadcasts })
  }
  if (input.recording) {
    slots.push({ id: 'record', glyph: '●', priority: STATUS_PRIORITY.record })
  }
  if (input.syncEnabled) {
    const glyph = statusGlyph(input.phase)
    if (glyph) slots.push({ id: 'sync', glyph, priority: STATUS_PRIORITY.sync, phase: input.phase })
  }
  slots.sort((a, b) => b.priority - a.priority)
  return { tray: false, slots }
}

/**
 * P11-3: the 22–24px bar keeps the urgent chips and drops the rest.
 * Disconnect, broadcast, and record outrank sync. Three chips fit; a fourth crowds the line.
 */
export const STATUS_VISIBLE_CAP = 3

export function fitStatusSlots(slots: readonly StatusSlot[], cap = STATUS_VISIBLE_CAP): StatusSlot[] {
  const limit = Number.isFinite(cap) ? Math.max(1, Math.floor(cap)) : STATUS_VISIBLE_CAP
  return [...slots].sort((a, b) => b.priority - a.priority).slice(0, limit)
}

/**
 * Offline and disconnect banners lead with the same sentence as the status bar.
 * A phase tail such as " · reconnecting in 3s" stays after that sentence.
 */
export function shareDisconnectCopy(host: string, locale: 'zh-CN' | 'en', phaseText: string): string {
  const lead = disconnectStatusSentence(host, locale)
  const bare = locale === 'en' ? 'Disconnected' : '连接已断开'
  if (phaseText.startsWith(lead)) return phaseText
  if (phaseText.startsWith(bare)) return lead + phaseText.slice(bare.length)
  return phaseText
}
