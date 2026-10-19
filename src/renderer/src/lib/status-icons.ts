import type { IconName } from '@shared/icon-registry'
import type { SyncPhase } from '@shared/sync-vault'

/** Map a status-bar slot to a linear icon (chrome weight). */
export function statusSlotIconName(slot: {
  id: string
  phase?: SyncPhase
}): IconName | null {
  if (slot.id === 'broadcast') return 'arrow-left-right'
  if (slot.id === 'record') return 'activity'
  if (slot.id === 'sync') {
    if (slot.phase === 'synced') return 'check'
    if (slot.phase === 'syncing') return 'refresh-cw'
    if (slot.phase === 'conflict' || slot.phase === 'error') return 'triangle-alert'
  }
  return null
}
