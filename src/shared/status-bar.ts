/** PNG-7: one quiet status-bar slot. No system tray. */

import { statusGlyph, type SyncPhase } from './sync-vault'

export type StatusSlot = { id: 'sync'; glyph: string; phase: SyncPhase }

export function statusBarSlots(input: { syncEnabled: boolean; phase: SyncPhase }): { tray: false; slots: StatusSlot[] } {
  if (!input.syncEnabled) return { tray: false, slots: [] }
  const glyph = statusGlyph(input.phase)
  if (!glyph) return { tray: false, slots: [] }
  return { tray: false, slots: [{ id: 'sync', glyph, phase: input.phase }] }
}
