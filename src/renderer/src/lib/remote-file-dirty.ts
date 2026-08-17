const dirtyByTab = new Map<string, boolean>()

export function setRemoteFileDirty(tabId: string, dirty: boolean): void {
  if (dirty) dirtyByTab.set(tabId, true)
  else dirtyByTab.delete(tabId)
}

export function isRemoteFileDirty(tabId: string): boolean {
  return dirtyByTab.get(tabId) === true
}

export function clearRemoteFileDirty(tabId: string): void {
  dirtyByTab.delete(tabId)
}
