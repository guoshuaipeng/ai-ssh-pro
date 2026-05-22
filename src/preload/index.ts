import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  SshConnectOptions,
  SshConnectResult,
  SshDataEvent,
  SshStatusEvent,
  SavedSessionProfile,
  SavedSessionsState,
  SessionImportPickResult,
  AiChatPayload,
  AiSettings,
  AiStreamEvent,
  AiParsedSshForm,
  AiDebugStreamPayload,
  AppDialogKind,
  SshSnapshotOptions
} from '../shared/ipc'

console.log('[preload] preload script starting')

function unsub(channel: string, fn: (e: IpcRendererEvent, ...args: unknown[]) => void): void {
  ipcRenderer.removeListener(channel, fn)
}

const api = {
  app: {
    onOpenDialog: (cb: (kind: AppDialogKind) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, kind: AppDialogKind) => cb(kind)
      ipcRenderer.on('app:open-dialog', fn)
      return () => ipcRenderer.removeListener('app:open-dialog', fn)
    }
  },
  ssh: {
    connect: (opts: SshConnectOptions): Promise<SshConnectResult> => ipcRenderer.invoke('ssh:connect', opts),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke('ssh:disconnect', sessionId),
    write: (sessionId: string, data: string): Promise<boolean> => ipcRenderer.invoke('ssh:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): Promise<boolean> =>
      ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
    getSnapshot: (sessionId: string, options?: number | SshSnapshotOptions): Promise<string | null> =>
      ipcRenderer.invoke('ssh:getSnapshot', sessionId, options),
    onData: (cb: (payload: SshDataEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as SshDataEvent)
      ipcRenderer.on('ssh:data', fn)
      return () => unsub('ssh:data', fn)
    },
    onStatus: (cb: (payload: SshStatusEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as SshStatusEvent)
      ipcRenderer.on('ssh:status', fn)
      return () => unsub('ssh:status', fn)
    }
  },
  sessions: {
    list: (): Promise<SavedSessionsState> => ipcRenderer.invoke('sessions:list'),
    save: (state: SavedSessionsState): Promise<void> => ipcRenderer.invoke('sessions:save', state),
    importPick: (): Promise<SessionImportPickResult | null> => ipcRenderer.invoke('sessions:importPick')
  },
  ai: {
    getSettings: (): Promise<AiSettings> => ipcRenderer.invoke('ai:settings:get'),
    setSettings: (partial: Partial<AiSettings>): Promise<void> => ipcRenderer.invoke('ai:settings:set', partial),
    chat: (payload: AiChatPayload): Promise<void> => ipcRenderer.invoke('ai:chat', payload),
    abortChat: (): Promise<void> => ipcRenderer.invoke('ai:abortChat'),
    confirmStep: (requestId: string, ok: boolean): Promise<boolean> =>
      ipcRenderer.invoke('ai:confirmStep', requestId, ok),
    parseSshForm: (rawText: string): Promise<AiParsedSshForm> =>
      ipcRenderer.invoke('ai:parseSshForm', rawText),
    onStream: (cb: (ev: AiStreamEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as AiStreamEvent)
      ipcRenderer.on('ai:stream', fn)
      return () => unsub('ai:stream', fn)
    }
  },
  debug: {
    openWindow: (): Promise<void> => ipcRenderer.invoke('debug:openWindow'),
    onPush: (cb: (payload: AiDebugStreamPayload) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as AiDebugStreamPayload)
      ipcRenderer.on('ai-debug:push', fn)
      return () => unsub('ai-debug:push', fn)
    }
  }
}

try {
  contextBridge.exposeInMainWorld('aiss', api)
  console.log('[preload] contextBridge.exposeInMainWorld("aiss") succeeded')
} catch (e) {
  console.error('[preload] contextBridge exposure failed (please share line + stack):', e)
}
