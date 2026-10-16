import type { TransferTask } from '@shared/sftp-queue'

/** In-renderer copy so two SFTP tabs merge their own host slice instead of wiping the other. */
let queueShadow: TransferTask[] | null = null

export function recallTransferQueue(): TransferTask[] | null {
  return queueShadow
}

export function rememberTransferQueue(tasks: TransferTask[]): void {
  queueShadow = tasks
}

/** Lets the tab closer ask one SFTP tab before dropping that tab's in-flight transfers. */

type Guard = () => Promise<'close' | 'cancel-close' | 'stay'>

const guards = new Map<string, Guard>()

export function registerSftpCloseGuard(tabId: string, fn: Guard | null): void {
  if (!tabId) return
  if (fn) guards.set(tabId, fn)
  else guards.delete(tabId)
}

export async function askSftpClose(tabId?: string): Promise<'close' | 'cancel-close' | 'stay'> {
  const guard = tabId ? guards.get(tabId) : undefined
  if (!guard) return 'close'
  return guard()
}

/** Palette / menu can arm a saved sync profile before the SFTP tab mounts. */
let armedSync: { profileId?: string } | null = null
let armedSyncSet = false
let pendingSync: { profileId?: string } | null = null

export function armFolderSync(profileId?: string): void {
  armedSync = { profileId }
  armedSyncSet = true
}

export function clearArmedFolderSync(): void {
  armedSync = null
  armedSyncSet = false
}

export function takeArmedFolderSync(): { set: boolean; profileId?: string } {
  const out = { set: armedSyncSet, profileId: armedSync?.profileId }
  clearArmedFolderSync()
  return out
}

export function requestFolderSync(profileId?: string): void {
  pendingSync = { profileId }
  window.dispatchEvent(new CustomEvent('aiss-open-folder-sync', { detail: profileId ?? '' }))
}

export function takeFolderSync(): { profileId?: string } | null {
  const cur = pendingSync
  pendingSync = null
  return cur
}
