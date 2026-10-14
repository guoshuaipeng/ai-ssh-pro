/** UX-46: dual-pane density. Width ≤1366 defaults to compact unless the user picks Comfort. */
export const COMPACT_BREAKPOINT = 1366

export type SftpDensityPref = 'auto' | 'comfort'
export type SftpDensity = 'compact' | 'comfort'

export const SFTP_DENSITY_KEY = 'aiss.sftp.density'
export const SFTP_DENSITY_EVENT = 'aiss-sftp-density'

export function loadSftpDensity(store: Pick<Storage, 'getItem'> = globalThis.localStorage): SftpDensityPref {
  try {
    return store.getItem(SFTP_DENSITY_KEY) === 'comfort' ? 'comfort' : 'auto'
  } catch {
    return 'auto'
  }
}

export function saveSftpDensity(pref: SftpDensityPref, store: Pick<Storage, 'setItem'> = globalThis.localStorage): void {
  store.setItem(SFTP_DENSITY_KEY, pref === 'comfort' ? 'comfort' : 'auto')
}

export function resolveSftpDensity(pref: SftpDensityPref, windowWidth: number): SftpDensity {
  if (pref === 'comfort') return 'comfort'
  return windowWidth <= COMPACT_BREAKPOINT ? 'compact' : 'comfort'
}
