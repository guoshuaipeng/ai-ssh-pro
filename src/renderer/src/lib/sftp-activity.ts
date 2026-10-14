/** Lets the tab closer ask the open SFTP panel before dropping in-flight transfers. */

type Guard = () => Promise<'close' | 'cancel-close' | 'stay'>

let guard: Guard | null = null

export function registerSftpCloseGuard(fn: Guard | null): void {
  guard = fn
}

export async function askSftpClose(): Promise<'close' | 'cancel-close' | 'stay'> {
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
