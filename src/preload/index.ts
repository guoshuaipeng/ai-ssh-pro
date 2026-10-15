import { snapshotKeep, snapshotsEnabled } from '../shared/snapshots'
import type { ResourceSnapshot } from '../shared/resource-monitor'
import type { DfRow, ExecOutcome, KillSignal, ListenPort, LogRequest, ProcInfo, ServiceAction, ServiceInfo } from '../shared/server-tools'
import type { BackupExportResult, BackupImportResult } from '../shared/ipc'
import type { ActiveForward, AddForwardRequest } from '../shared/ipc'
import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron'
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
  AiAssistRequest,
  AiAssistResult,
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
  DockerChangedEvent,
  AppUpdateCheckResult,
  McpGuideInfo
} from '../shared/ipc'
import type {
  BatchExecRequest,
  BatchExecResult,
  LocaleId,
  RecentConnection
} from '../shared/workspace-features'
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
    checkUpdate: (opts?: { channel?: 'auto' | 'gitee' | 'github' | 'custom'; customUrl?: string }): Promise<AppUpdateCheckResult> =>
      ipcRenderer.invoke('app:checkUpdate', opts),
    focus: (): Promise<boolean> => ipcRenderer.invoke('app:focus'),
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke('app:openExternal', url),
    openGithub: (): Promise<boolean> => ipcRenderer.invoke('app:openGithub'),
    getMcpGuideInfo: (): Promise<McpGuideInfo> => ipcRenderer.invoke('app:getMcpGuideInfo'),
    setUiChrome: (chrome: {
      backgroundColor: string
      overlayColor: string
      symbolColor: string
    }): Promise<boolean> => ipcRenderer.invoke('app:setUiChrome', chrome)
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
    startRecording: (sessionId: string, opts?: { auto?: boolean; host?: string; cols?: number; rows?: number; title?: string }): Promise<string | null> =>
      ipcRenderer.invoke('ssh:startRecording', sessionId, opts),
    stopRecording: (sessionId: string): Promise<boolean> => ipcRenderer.invoke('ssh:stopRecording', sessionId),
    exec: (sessionId: string, command: string, timeoutMs?: number): Promise<{ code: number | null; stdout: string; stderr: string }> =>
      ipcRenderer.invoke('ssh:exec', sessionId, command, timeoutMs),
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
    },
    probeJump: (opts: SshConnectOptions): Promise<import('../shared/jump-chain').HopProbeRow[]> =>
      ipcRenderer.invoke('ssh:probeJump', opts),
    onHop: (cb: (payload: { hop: number; total: number; name: string }) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) => cb(args[0] as { hop: number; total: number; name: string })
      ipcRenderer.on('ssh:hop', fn)
      return () => unsub('ssh:hop', fn)
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
    },
    stat: (sessionId: string, remotePath: string) => ipcRenderer.invoke('sftp:stat', sessionId, remotePath),
    hash: (sessionId: string, remotePath: string): Promise<string> => ipcRenderer.invoke('sftp:hash', sessionId, remotePath),
    cancel: (transferId: string): Promise<boolean> => ipcRenderer.invoke('sftp:cancel', transferId),
    transfer: (payload: {
      sessionId: string
      direction: 'upload' | 'download'
      localPath: string
      remotePath: string
      transferId?: string
      offset?: number
    }): Promise<void> => ipcRenderer.invoke('sftp:transfer', payload),
    queueLoad: () => ipcRenderer.invoke('sftp:queueLoad'),
    queueSave: (tasks: unknown) => ipcRenderer.invoke('sftp:queueSave', tasks)
  },
  localFs: {
    home: (): Promise<string> => ipcRenderer.invoke('localFs:home'),
    list: (dir: string): Promise<SftpListResult> => ipcRenderer.invoke('localFs:list', dir),
    stat: (target: string) => ipcRenderer.invoke('localFs:stat', target),
    mkdir: (target: string): Promise<boolean> => ipcRenderer.invoke('localFs:mkdir', target),
    rename: (from: string, to: string): Promise<boolean> => ipcRenderer.invoke('localFs:rename', from, to),
    trash: (target: string): Promise<{ token: string }> => ipcRenderer.invoke('localFs:trash', target),
    restore: (token: string): Promise<boolean> => ipcRenderer.invoke('localFs:restore', token),
    reveal: (target: string): Promise<boolean> => ipcRenderer.invoke('localFs:reveal', target),
    hash: (target: string): Promise<string> => ipcRenderer.invoke('localFs:hash', target),
    readText: (target: string, maxBytes?: number): Promise<import('../shared/ipc').SftpReadTextResult> =>
      ipcRenderer.invoke('localFs:readText', target, maxBytes),
    detectKeyKind: (target: string): Promise<import('../shared/ssh-cert').KeyKind> =>
      ipcRenderer.invoke('localFs:detectKeyKind', target)
  },
  docker: {
    listTree: (sessionId: string): Promise<DockerTreeResult> =>
      ipcRenderer.invoke('docker:listTree', sessionId),
    watchEvents: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke('docker:watchEvents', sessionId),
    unwatchEvents: (sessionId: string): Promise<boolean> =>
      ipcRenderer.invoke('docker:unwatchEvents', sessionId),
    onChanged: (cb: (payload: DockerChangedEvent) => void): (() => void) => {
      const fn = (_e: IpcRendererEvent, ...args: unknown[]) =>
        cb(args[0] as DockerChangedEvent)
      ipcRenderer.on('docker:changed', fn)
      return () => unsub('docker:changed', fn)
    },
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
    /** Local path of a dropped File (Electron 32+ removed File.path). Empty string when not a disk file. */
    pathForFile: (file: File): string => {
      try {
        return webUtils.getPathForFile(file)
      } catch {
        return ''
      }
    },
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
    assist: (req: AiAssistRequest): Promise<AiAssistResult> => ipcRenderer.invoke('ai:assist', req),
    abortAssist: (requestId: string): Promise<void> => ipcRenderer.invoke('ai:assistAbort', requestId),
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
  },
  backup: {
    export: (opts: { password: string; includeAi?: boolean }): Promise<BackupExportResult> => ipcRenderer.invoke('backup:export', opts),
    import: (opts: { password: string }): Promise<BackupImportResult> => ipcRenderer.invoke('backup:import', opts)
  },
  tools: {
    processes: (sessionId: string): Promise<ProcInfo[]> => ipcRenderer.invoke('tools:processes', sessionId),
    kill: (sessionId: string, pid: number, signal: KillSignal, sudo: boolean): Promise<ExecOutcome> =>
      ipcRenderer.invoke('tools:kill', sessionId, pid, signal, sudo),
    services: (sessionId: string): Promise<ServiceInfo[]> => ipcRenderer.invoke('tools:services', sessionId),
    service: (sessionId: string, unit: string, action: ServiceAction, sudo: boolean): Promise<ExecOutcome> =>
      ipcRenderer.invoke('tools:service', sessionId, unit, action, sudo),
    ports: (sessionId: string): Promise<ListenPort[]> => ipcRenderer.invoke('tools:ports', sessionId),
    df: (sessionId: string): Promise<DfRow[]> => ipcRenderer.invoke('tools:df', sessionId),
    logs: (sessionId: string, req: LogRequest): Promise<{ text: string; code: number | null; at: number }> =>
      ipcRenderer.invoke('tools:logs', sessionId, req)
  },
  workspace: {
    ping: (sessionId: string): Promise<number | null> => ipcRenderer.invoke('workspace:ping', sessionId),
    probeHosts: (
      targets: import('../shared/host-status').HostProbeTarget[]
    ): Promise<import('../shared/host-status').HostProbeResult[]> => ipcRenderer.invoke('workspace:probeHosts', targets),
    batchExec: (payload: BatchExecRequest): Promise<BatchExecResult> =>
      ipcRenderer.invoke('workspace:batchExec', payload),
    resources: (sessionId: string): Promise<ResourceSnapshot & { at: number }> => ipcRenderer.invoke('workspace:resources', sessionId),
    healthProbe: (req: import('../shared/ipc').SshConnectOptions & { profileId: string; reuseSessionId?: string }): Promise<import('../shared/health-probe').HealthProbeResult> =>
      ipcRenderer.invoke('workspace:healthProbe', req),
    healthProbeSweep: (idleMs: number): Promise<{ ok: boolean }> => ipcRenderer.invoke('workspace:healthProbeSweep', idleMs),
    healthProbeRelease: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('workspace:healthProbeRelease'),
    forwards: {
      list: (sessionId?: string): Promise<ActiveForward[]> => ipcRenderer.invoke('workspace:forwards:list', sessionId),
      add: (req: AddForwardRequest): Promise<ActiveForward> => ipcRenderer.invoke('workspace:forwards:add', req),
      remove: (id: string): Promise<boolean> => ipcRenderer.invoke('workspace:forwards:remove', id)
    },
    commandHistory: {
      list: (): Promise<string[]> => ipcRenderer.invoke('workspace:commandHistory:list'),
      push: (command: string): Promise<string[]> => ipcRenderer.invoke('workspace:commandHistory:push', command),
      clear: (): Promise<string[]> => ipcRenderer.invoke('workspace:commandHistory:clear')
    },
    recent: {
      list: (): Promise<RecentConnection[]> => ipcRenderer.invoke('workspace:recent:list'),
      remove: (id: string): Promise<RecentConnection[]> => ipcRenderer.invoke('workspace:recent:remove', id),
      pin: (id: string, pinned: boolean): Promise<RecentConnection[]> =>
        ipcRenderer.invoke('workspace:recent:pin', id, pinned)
    },
    locale: {
      get: (): Promise<LocaleId> => ipcRenderer.invoke('workspace:locale:get'),
      set: (locale: LocaleId): Promise<LocaleId> => ipcRenderer.invoke('workspace:locale:set', locale)
    }
  },
  recordings: {
    list: (): Promise<Array<{ file: string; host: string; bytes: number; mtime: number }>> => ipcRenderer.invoke('recordings:list'),
    read: (file: string): Promise<string> => ipcRenderer.invoke('recordings:read', file),
    delete: (file: string): Promise<boolean> => ipcRenderer.invoke('recordings:delete', file)
  },
  sync: {
    getConfig: (): Promise<unknown> => ipcRenderer.invoke('sync:getConfig'),
    setConfig: (patch: unknown): Promise<unknown> => ipcRenderer.invoke('sync:setConfig', patch),
    test: (): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('sync:test'),
    push: (payload: unknown, passphrase: string): Promise<{ ok: boolean; message?: string; id?: string }> =>
      ipcRenderer.invoke('sync:push', payload, passphrase),
    pull: (passphrase: string): Promise<{ ok: boolean; message?: string; empty?: boolean; payload?: unknown }> =>
      ipcRenderer.invoke('sync:pull', passphrase),
    backupLocal: (payload: unknown): Promise<{ ok: boolean; file?: string }> => ipcRenderer.invoke('sync:backupLocal', payload)
  },
  files: {
    saveText: (defaultName: string, content: string): Promise<string | null> => ipcRenderer.invoke('fs:saveText', defaultName, content)
  },
  snapshots: {
    list: (query?: { profileId?: string; path?: string }): Promise<Array<Record<string, unknown>>> => ipcRenderer.invoke('snapshots:list', query),
    stats: (): Promise<{ files: number; bytes: number; count: number }> => ipcRenderer.invoke('snapshots:stats'),
    put: (input: { profileId: string; path: string; content: string; source: string; stale?: boolean; isText?: boolean; keep?: number; auto?: boolean }): Promise<{ added: boolean; skipped: string | null; count: number }> =>
      ipcRenderer.invoke('snapshots:put', { ...input, keep: input.keep ?? snapshotKeep(), auto: input.auto ?? snapshotsEnabled() }),
    setPrefs: (prefs: { auto?: boolean; keep?: number }): Promise<{ auto: boolean; keep: number }> => ipcRenderer.invoke('snapshots:setPrefs', prefs),
    read: (id: string): Promise<{ ok: boolean; content?: string; reason?: string }> => ipcRenderer.invoke('snapshots:read', id),
    pin: (id: string, pinned: boolean): Promise<unknown> => ipcRenderer.invoke('snapshots:pin', id, pinned),
    delete: (id: string): Promise<{ ok: boolean }> => ipcRenderer.invoke('snapshots:delete', id),
    clear: (): Promise<{ ok: boolean; n: number }> => ipcRenderer.invoke('snapshots:clear'),
    openDir: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('snapshots:openDir')
  }
}

try {
  contextBridge.exposeInMainWorld('aiss', api)
  console.log('[preload] contextBridge.exposeInMainWorld("aiss") succeeded')
} catch (e) {
  console.error('[preload] contextBridge exposure failed (please share line + stack):', e)
}
