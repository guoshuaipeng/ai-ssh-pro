import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  SshConnectOptions,
  SshConnectResult,
  SshDataEvent,
  SshStatusEvent,
  SavedSessionProfile,
  AiChatPayload,
  AiSettings,
  AiStreamEvent
} from '../shared/ipc'

console.log('[preload] 脚本开始执行')

function unsub(channel: string, fn: (e: IpcRendererEvent, ...args: unknown[]) => void): void {
  ipcRenderer.removeListener(channel, fn)
}

const api = {
  ssh: {
    connect: (opts: SshConnectOptions): Promise<SshConnectResult> => ipcRenderer.invoke('ssh:connect', opts),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke('ssh:disconnect', sessionId),
    write: (sessionId: string, data: string): Promise<boolean> => ipcRenderer.invoke('ssh:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): Promise<boolean> =>
      ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
    getSnapshot: (sessionId: string, maxLines?: number): Promise<string | null> =>
      ipcRenderer.invoke('ssh:getSnapshot', sessionId, maxLines),
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
    list: (): Promise<SavedSessionProfile[]> => ipcRenderer.invoke('sessions:list'),
    save: (list: SavedSessionProfile[]): Promise<void> => ipcRenderer.invoke('sessions:save', list)
  },
  ai: {
    getSettings: (): Promise<AiSettings> => ipcRenderer.invoke('ai:settings:get'),
    setSettings: (partial: Partial<AiSettings>): Promise<void> => ipcRenderer.invoke('ai:settings:set', partial),
    chat: (payload: AiChatPayload): Promise<void> => ipcRenderer.invoke('ai:chat', payload),
    onStream: (cb: (ev: AiStreamEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as AiStreamEvent)
      ipcRenderer.on('ai:stream', fn)
      return () => unsub('ai:stream', fn)
    }
  }
}

try {
  contextBridge.exposeInMainWorld('aiss', api)
  console.log('[preload] contextBridge.exposeInMainWorld("aiss") 已成功')
} catch (e) {
  console.error('[preload] contextBridge 暴露失败（请把本行及堆栈发给开发者）:', e)
}
