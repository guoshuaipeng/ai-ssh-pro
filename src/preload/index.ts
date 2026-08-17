import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type {
  SshConnectOptions,
  SshConnectResult,
  SshDataEvent,
  SshStatusEvent,
  SshHostKeyPromptEvent,
  SshHostKeyRespondPayload,
  SavedSessionsState,
  SessionImportPickResult,
  SessionExportFormat,
  AiChatPayload,
  AiChatMessage,
  AiSettings,
  AiStreamEvent,
  AiParsedSshForm,
  AiDebugStreamPayload,
  AppDialogKind,
  SshSnapshotOptions,
  SftpListResult,
  TerminalPrefs,
  CommandSnippet,
  DockerTreeResult,
  DockerContainerAction,
  DockerContainerDetail,
  DockerComposeAction,
  DockerComposeService,
  DockerSwarmAction,
  DockerSwarmServiceDetail,
  AppUpdateCheckResult
} from '../shared/ipc'
import type {
  HostInventoryIndexEntry,
  HostInventoryRecord,
  HostInventoryUpsertInput,
  HostService
} from '../shared/inventory'

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
    },
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    checkUpdate: (): Promise<AppUpdateCheckResult> => ipcRenderer.invoke('app:checkUpdate'),
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('app:openExternal', url),
    openGithub: (): Promise<boolean> => ipcRenderer.invoke('app:openGithub')
  },
  ssh: {
    connect: (opts: SshConnectOptions): Promise<SshConnectResult> => ipcRenderer.invoke('ssh:connect', opts),
    disconnect: (sessionId: string): Promise<void> => ipcRenderer.invoke('ssh:disconnect', sessionId),
    write: (sessionId: string, data: string | Uint8Array | number[]): Promise<boolean> =>
      ipcRenderer.invoke('ssh:write', sessionId, data),
    resize: (sessionId: string, cols: number, rows: number): Promise<boolean> =>
      ipcRenderer.invoke('ssh:resize', sessionId, cols, rows),
    getSnapshot: (sessionId: string, options?: number | SshSnapshotOptions): Promise<string | null> =>
      ipcRenderer.invoke('ssh:getSnapshot', sessionId, options),
    respondHostKey: (payload: SshHostKeyRespondPayload): Promise<boolean> =>
      ipcRenderer.invoke('ssh:respondHostKey', payload),
    openLocalShell: (): Promise<SshConnectResult> => ipcRenderer.invoke('ssh:openLocalShell'),
    isLocalShellAvailable: (): Promise<boolean> => ipcRenderer.invoke('ssh:isLocalShellAvailable'),
    startRecording: (sessionId: string): Promise<string | null> =>
      ipcRenderer.invoke('ssh:startRecording', sessionId),
    stopRecording: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('ssh:stopRecording', sessionId),
    onData: (cb: (payload: SshDataEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as SshDataEvent)
      ipcRenderer.on('ssh:data', fn)
      return () => unsub('ssh:data', fn)
    },
    onStatus: (cb: (payload: SshStatusEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as SshStatusEvent)
      ipcRenderer.on('ssh:status', fn)
      return () => unsub('ssh:status', fn)
    },
    onHostKeyPrompt: (cb: (payload: SshHostKeyPromptEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as SshHostKeyPromptEvent)
      ipcRenderer.on('ssh:hostKeyPrompt', fn)
      return () => unsub('ssh:hostKeyPrompt', fn)
    }
  },
  sftp: {
    list: (sessionId: string, remotePath: string): Promise<SftpListResult> =>
      ipcRenderer.invoke('sftp:list', sessionId, remotePath),
    home: (sessionId: string): Promise<string> => ipcRenderer.invoke('sftp:home', sessionId),
    download: (
      sessionId: string,
      remotePath: string,
      localPath: string,
      transferId?: string
    ): Promise<void> => ipcRenderer.invoke('sftp:download', sessionId, remotePath, localPath, transferId),
    upload: (
      sessionId: string,
      localPath: string,
      remotePath: string,
      transferId?: string
    ): Promise<void> => ipcRenderer.invoke('sftp:upload', sessionId, localPath, remotePath, transferId),
    mkdir: (sessionId: string, remotePath: string): Promise<void> =>
      ipcRenderer.invoke('sftp:mkdir', sessionId, remotePath),
    remove: (sessionId: string, remotePath: string): Promise<void> =>
      ipcRenderer.invoke('sftp:remove', sessionId, remotePath),
    rename: (sessionId: string, fromPath: string, toPath: string): Promise<void> =>
      ipcRenderer.invoke('sftp:rename', sessionId, fromPath, toPath),
    readText: (
      sessionId: string,
      remotePath: string,
      maxBytes?: number
    ): Promise<import('../shared/ipc').SftpReadTextResult> =>
      ipcRenderer.invoke('sftp:readText', sessionId, remotePath, maxBytes),
    writeText: (sessionId: string, remotePath: string, content: string): Promise<boolean> =>
      ipcRenderer.invoke('sftp:writeText', sessionId, remotePath, content),
    pickDownloadPath: (defaultName?: string): Promise<string | null> =>
      ipcRenderer.invoke('sftp:pickDownloadPath', defaultName),
    pickUploadFiles: (): Promise<string[] | null> => ipcRenderer.invoke('sftp:pickUploadFiles'),
    pickSavePaths: (names: string[]): Promise<string[] | null> =>
      ipcRenderer.invoke('sftp:pickSavePaths', names),
    onProgress: (cb: (payload: import('../shared/ipc').SftpProgressEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) =>
        cb(args[0] as import('../shared/ipc').SftpProgressEvent)
      ipcRenderer.on('sftp:progress', fn)
      return () => unsub('sftp:progress', fn)
    }
  },
  docker: {
    listTree: (sessionId: string): Promise<DockerTreeResult> =>
      ipcRenderer.invoke('docker:listTree', sessionId),
    containerAction: (
      sessionId: string,
      containerId: string,
      action: DockerContainerAction
    ): Promise<boolean> => ipcRenderer.invoke('docker:containerAction', sessionId, containerId, action),
    inspect: (sessionId: string, containerId: string): Promise<DockerContainerDetail> =>
      ipcRenderer.invoke('docker:inspect', sessionId, containerId),
    logs: (sessionId: string, containerId: string, tail?: number): Promise<string> =>
      ipcRenderer.invoke('docker:logs', sessionId, containerId, tail),
    swarmInspect: (sessionId: string, service: string): Promise<DockerSwarmServiceDetail> =>
      ipcRenderer.invoke('docker:swarmInspect', sessionId, service),
    swarmLogs: (sessionId: string, service: string, tail?: number): Promise<string> =>
      ipcRenderer.invoke('docker:swarmLogs', sessionId, service, tail),
    swarmAction: (
      sessionId: string,
      service: string,
      action: DockerSwarmAction,
      replicas?: number
    ): Promise<boolean> =>
      ipcRenderer.invoke('docker:swarmAction', sessionId, service, action, replicas),
    composePs: (
      sessionId: string,
      project: string
    ): Promise<{ services: DockerComposeService[]; error?: string }> =>
      ipcRenderer.invoke('docker:composePs', sessionId, project),
    composeAction: (
      sessionId: string,
      project: string,
      action: DockerComposeAction
    ): Promise<boolean> => ipcRenderer.invoke('docker:composeAction', sessionId, project, action),
    openShell: (
      sessionId: string,
      containerId: string,
      opts?: { termCols?: number; termRows?: number; label?: string }
    ): Promise<SshConnectResult> => ipcRenderer.invoke('docker:openShell', sessionId, containerId, opts)
  },
  fs: {
    writeFile: (filePath: string, data: number[] | Uint8Array): Promise<boolean> =>
      ipcRenderer.invoke('fs:writeFile', filePath, data)
  },
  sessions: {
    list: (): Promise<SavedSessionsState> => ipcRenderer.invoke('sessions:list'),
    save: (state: SavedSessionsState): Promise<void> => ipcRenderer.invoke('sessions:save', state),
    importPick: (): Promise<SessionImportPickResult | null> => ipcRenderer.invoke('sessions:importPick'),
    export: (format: SessionExportFormat): Promise<string> => ipcRenderer.invoke('sessions:export', format)
  },
  snippets: {
    list: (): Promise<CommandSnippet[]> => ipcRenderer.invoke('snippets:list'),
    save: (list: CommandSnippet[]): Promise<void> => ipcRenderer.invoke('snippets:save', list)
  },
  inventory: {
    list: (): Promise<HostInventoryIndexEntry[]> => ipcRenderer.invoke('inventory:list'),
    get: (id: string): Promise<HostInventoryRecord | null> => ipcRenderer.invoke('inventory:get', id),
    search: (query: string): Promise<HostInventoryIndexEntry[]> => ipcRenderer.invoke('inventory:search', query),
    upsert: (input: HostInventoryUpsertInput): Promise<HostInventoryRecord> =>
      ipcRenderer.invoke('inventory:upsert', input),
    remove: (id: string): Promise<boolean> => ipcRenderer.invoke('inventory:remove', id),
    getRoot: (): Promise<string> => ipcRenderer.invoke('inventory:getRoot'),
    upsertService: (hostId: string, service: HostService): Promise<HostInventoryRecord | null> =>
      ipcRenderer.invoke('inventory:upsertService', hostId, service),
    appendNote: (hostId: string, note: string): Promise<HostInventoryRecord | null> =>
      ipcRenderer.invoke('inventory:appendNote', hostId, note)
  },
  terminal: {
    getPrefs: (): Promise<TerminalPrefs> => ipcRenderer.invoke('terminal:getPrefs'),
    setPrefs: (partial: Partial<TerminalPrefs>): Promise<TerminalPrefs> =>
      ipcRenderer.invoke('terminal:setPrefs', partial)
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
    getChatHistory: (key: string): Promise<AiChatMessage[]> => ipcRenderer.invoke('ai:chatHistory:get', key),
    setChatHistory: (key: string, messages: AiChatMessage[]): Promise<void> =>
      ipcRenderer.invoke('ai:chatHistory:set', key, messages),
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
