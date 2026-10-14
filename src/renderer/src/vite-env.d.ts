/// <reference types="vite/client" />

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
  DockerChangedEvent,
  AppUpdateCheckResult,
  McpGuideInfo
} from '@shared/ipc'
import type {
  BatchExecRequest,
  BatchExecResult,
  LocaleId,
  RecentConnection
} from '@shared/workspace-features'
import type {
  HostInventoryIndexEntry,
  HostInventoryRecord,
  HostInventoryUpsertInput,
  HostService
} from '@shared/inventory'

export type AissPreload = {
  app: {
    onOpenDialog: (cb: (kind: AppDialogKind) => void) => () => void
    getVersion: () => Promise<string>
    checkUpdate: () => Promise<AppUpdateCheckResult>
    openExternal: (url: string) => Promise<boolean>
    openGithub: () => Promise<boolean>
    getMcpGuideInfo: () => Promise<McpGuideInfo>
    setUiChrome: (chrome: {
      backgroundColor: string
      overlayColor: string
      symbolColor: string
    }) => Promise<boolean>
  }
  ssh: {
    connect: (opts: SshConnectOptions) => Promise<SshConnectResult>
    disconnect: (sessionId: string) => Promise<void>
    write: (sessionId: string, data: string | Uint8Array | number[]) => Promise<boolean>
    resize: (sessionId: string, cols: number, rows: number) => Promise<boolean>
    getSnapshot: (sessionId: string, options?: number | SshSnapshotOptions) => Promise<string | null>
    respondHostKey: (payload: SshHostKeyRespondPayload) => Promise<boolean>
    openLocalShell: () => Promise<SshConnectResult>
    isLocalShellAvailable: () => Promise<boolean>
    startRecording: (sessionId: string) => Promise<string | null>
    stopRecording: (sessionId: string) => Promise<boolean>
    onData: (cb: (payload: SshDataEvent) => void) => () => void
    onStatus: (cb: (payload: SshStatusEvent) => void) => () => void
    onHostKeyPrompt: (cb: (payload: SshHostKeyPromptEvent) => void) => () => void
  }
  sftp: {
    list: (sessionId: string, remotePath: string) => Promise<SftpListResult>
    home: (sessionId: string) => Promise<string>
    download: (
      sessionId: string,
      remotePath: string,
      localPath: string,
      transferId?: string
    ) => Promise<void>
    upload: (
      sessionId: string,
      localPath: string,
      remotePath: string,
      transferId?: string
    ) => Promise<void>
    mkdir: (sessionId: string, remotePath: string) => Promise<void>
    remove: (sessionId: string, remotePath: string) => Promise<void>
    rename: (sessionId: string, fromPath: string, toPath: string) => Promise<void>
    readText: (
      sessionId: string,
      remotePath: string,
      maxBytes?: number
    ) => Promise<import('@shared/ipc').SftpReadTextResult>
    writeText: (sessionId: string, remotePath: string, content: string) => Promise<boolean>
    pickDownloadPath: (defaultName?: string) => Promise<string | null>
    pickUploadFiles: () => Promise<string[] | null>
    pickSavePaths: (names: string[]) => Promise<string[] | null>
    onProgress: (cb: (payload: import('@shared/ipc').SftpProgressEvent) => void) => () => void
  }
  docker: {
    listTree: (sessionId: string) => Promise<DockerTreeResult>
    watchEvents: (sessionId: string) => Promise<boolean>
    unwatchEvents: (sessionId: string) => Promise<boolean>
    onChanged: (cb: (payload: DockerChangedEvent) => void) => () => void
    containerAction: (
      sessionId: string,
      containerId: string,
      action: DockerContainerAction
    ) => Promise<boolean>
    inspect: (sessionId: string, containerId: string) => Promise<DockerContainerDetail>
    logs: (sessionId: string, containerId: string, tail?: number) => Promise<string>
    swarmInspect: (sessionId: string, service: string) => Promise<DockerSwarmServiceDetail>
    swarmLogs: (sessionId: string, service: string, tail?: number) => Promise<string>
    swarmAction: (
      sessionId: string,
      service: string,
      action: DockerSwarmAction,
      replicas?: number
    ) => Promise<boolean>
    composePs: (
      sessionId: string,
      project: string
    ) => Promise<{ services: DockerComposeService[]; error?: string }>
    composeAction: (
      sessionId: string,
      project: string,
      action: DockerComposeAction
    ) => Promise<boolean>
    openShell: (
      sessionId: string,
      containerId: string,
      opts?: { termCols?: number; termRows?: number; label?: string }
    ) => Promise<SshConnectResult>
  }
  fs: {
    pathForFile: (file: File) => string
    writeFile: (filePath: string, data: number[] | Uint8Array) => Promise<boolean>
  }
  sessions: {
    list: () => Promise<SavedSessionsState>
    save: (state: SavedSessionsState) => Promise<void>
    importPick: () => Promise<SessionImportPickResult | null>
    export: (format: SessionExportFormat) => Promise<string>
  }
  snippets: {
    list: () => Promise<CommandSnippet[]>
    save: (list: CommandSnippet[]) => Promise<void>
  }
  inventory: {
    list: () => Promise<HostInventoryIndexEntry[]>
    get: (id: string) => Promise<HostInventoryRecord | null>
    search: (query: string) => Promise<HostInventoryIndexEntry[]>
    upsert: (input: HostInventoryUpsertInput) => Promise<HostInventoryRecord>
    remove: (id: string) => Promise<boolean>
    getRoot: () => Promise<string>
    upsertService: (hostId: string, service: HostService) => Promise<HostInventoryRecord | null>
    appendNote: (hostId: string, note: string) => Promise<HostInventoryRecord | null>
  }
  terminal: {
    getPrefs: () => Promise<TerminalPrefs>
    setPrefs: (partial: Partial<TerminalPrefs>) => Promise<TerminalPrefs>
  }
  ai: {
    getSettings: () => Promise<AiSettings>
    setSettings: (partial: Partial<AiSettings>) => Promise<void>
    chat: (payload: AiChatPayload) => Promise<void>
    abortChat: () => Promise<void>
    confirmStep: (requestId: string, ok: boolean) => Promise<boolean>
    parseSshForm: (rawText: string) => Promise<AiParsedSshForm>
    getChatHistory: (key: string) => Promise<AiChatMessage[]>
    setChatHistory: (key: string, messages: AiChatMessage[]) => Promise<void>
    onStream: (cb: (ev: AiStreamEvent) => void) => () => void
  }
  debug: {
    openWindow: () => Promise<void>
    onPush: (cb: (payload: AiDebugStreamPayload) => void) => () => void
  }
  tools: {
    processes: (sessionId: string) => Promise<import('../../shared/server-tools').ProcInfo[]>
    kill: (
      sessionId: string,
      pid: number,
      signal: import('../../shared/server-tools').KillSignal,
      sudo: boolean
    ) => Promise<import('../../shared/server-tools').ExecOutcome>
    services: (sessionId: string) => Promise<import('../../shared/server-tools').ServiceInfo[]>
    service: (
      sessionId: string,
      unit: string,
      action: import('../../shared/server-tools').ServiceAction,
      sudo: boolean
    ) => Promise<import('../../shared/server-tools').ExecOutcome>
    ports: (sessionId: string) => Promise<import('../../shared/server-tools').ListenPort[]>
    logs: (
      sessionId: string,
      req: import('../../shared/server-tools').LogRequest
    ) => Promise<{ text: string; code: number | null; at: number }>
  }
  backup: {
    export: (opts: { password: string; includeAi?: boolean }) => Promise<import('@shared/ipc').BackupExportResult>
    import: (opts: { password: string }) => Promise<import('@shared/ipc').BackupImportResult>
  }
  workspace: {
    ping: (sessionId: string) => Promise<number | null>
    probeHosts: (
      targets: import('../../shared/host-status').HostProbeTarget[]
    ) => Promise<import('../../shared/host-status').HostProbeResult[]>
    batchExec: (payload: BatchExecRequest) => Promise<BatchExecResult>
    resources: (sessionId: string) => Promise<import('../../shared/resource-monitor').ResourceSnapshot & { at: number }>
    forwards: {
      list: (sessionId?: string) => Promise<import('@shared/ipc').ActiveForward[]>
      add: (req: import('@shared/ipc').AddForwardRequest) => Promise<import('@shared/ipc').ActiveForward>
      remove: (id: string) => Promise<boolean>
    }
    commandHistory: {
      list: () => Promise<string[]>
      push: (command: string) => Promise<string[]>
      clear: () => Promise<string[]>
    }
    recent: {
      list: () => Promise<RecentConnection[]>
      remove: (id: string) => Promise<RecentConnection[]>
      pin: (id: string, pinned: boolean) => Promise<RecentConnection[]>
    }
    locale: {
      get: () => Promise<LocaleId>
      set: (locale: LocaleId) => Promise<LocaleId>
    }
  }
}

declare global {
  interface Window {
    aiss: AissPreload
  }
}

export {}
