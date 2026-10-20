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
} from '@shared/ipc'
import type { AiProviderTestInput, AiProviderTestResult } from '@shared/ai-provider-test'
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
  clipboard: {
    writeText: (text: string) => void
    readText: () => string
  }
  app: {
    onOpenDialog: (cb: (kind: AppDialogKind) => void) => () => void
    getVersion: () => Promise<string>
    checkUpdate: (opts?: { channel?: 'auto' | 'gitee' | 'github' | 'custom'; customUrl?: string }) => Promise<AppUpdateCheckResult>
    focus: () => Promise<boolean>
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
    openLocalShell: (opts?: { cwd?: string }) => Promise<SshConnectResult>
    isLocalShellAvailable: () => Promise<boolean>
    startRecording: (sessionId: string, opts?: { auto?: boolean; host?: string; cols?: number; rows?: number; title?: string }) => Promise<string | null>
    stopRecording: (sessionId: string) => Promise<boolean>
    setShellIntegration?: (sessionId: string, on: boolean) => Promise<boolean>
    exec: (sessionId: string, command: string, timeoutMs?: number) => Promise<{ code: number | null; stdout: string; stderr: string }>
    onData: (cb: (payload: SshDataEvent) => void) => () => void
    onStatus: (cb: (payload: SshStatusEvent) => void) => () => void
    onHostKeyPrompt: (cb: (payload: SshHostKeyPromptEvent) => void) => () => void
    onPowerResume?: (cb: () => void) => () => void
    onHostKeyExpired?: (cb: (payload: { requestId: string }) => void) => () => void
    probeJump: (opts: SshConnectOptions) => Promise<import('@shared/jump-chain').HopProbeRow[]>
    onHop: (cb: (payload: { hop: number; total: number; name: string }) => void) => () => void
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
    stat: (sessionId: string, remotePath: string) => Promise<{ size: number; mtime?: number; isDirectory: boolean } | null>
    hash: (sessionId: string, remotePath: string) => Promise<string>
    cancel: (transferId: string) => Promise<boolean>
    transfer: (payload: {
      sessionId: string
      direction: 'upload' | 'download'
      localPath: string
      remotePath: string
      transferId?: string
      offset?: number
    }) => Promise<void>
    queueLoad: () => Promise<import('@shared/sftp-queue').TransferTask[]>
    queueSave: (tasks: unknown) => Promise<import('@shared/sftp-queue').TransferTask[]>
  }
  localFs: {
    home: () => Promise<string>
    drives: () => Promise<import('@shared/local-drives').LocalDriveListing>
    list: (dir: string) => Promise<SftpListResult>
    stat: (target: string) => Promise<{ size: number; mtime: number; isDirectory: boolean } | null>
    mkdir: (target: string) => Promise<boolean>
    rename: (from: string, to: string) => Promise<boolean>
    trash: (target: string) => Promise<{ token: string }>
    restore: (token: string) => Promise<boolean>
    reveal: (target: string) => Promise<boolean>
    hash: (target: string) => Promise<string>
    readText: (target: string, maxBytes?: number) => Promise<import('@shared/ipc').SftpReadTextResult>
    detectKeyKind: (target: string) => Promise<import('@shared/ssh-cert').KeyKind>
    pickPrivateKey: () => Promise<string | null>
    pickCertificate: () => Promise<string | null>
  }
  knownHosts: {
    list: () => Promise<
      Array<{ hostPort: string; fingerprint: string; hostKeyBase64: string; trustedAt: number }>
    >
    remove: (hostPort: string) => Promise<boolean>
    pickImport: () => Promise<{
      rows: Array<{
        host: string
        port: number
        hostPort: string
        keyType: string
        hostKeyBase64: string
        action: 'add' | 'update' | 'unchanged'
        fingerprint: string
        selectedDefault: boolean
        previousFingerprint?: string
      }>
      skippedHashed: number
      skippedOther: number
      skippedHashedSamples: string[]
      sourcePath?: string
    } | null>
    applyImport: (
      rows: Array<{ host: string; port: number; hostKeyBase64: string }>
    ) => Promise<{ ok: number; fail: number }>
    listLocalKeys: () => Promise<{
      dir: string
      keys: Array<{ name: string; path: string }>
      error?: string
    }>
    openSshDir: () => Promise<boolean>
    lookupHost: (
      host: string,
      port?: number
    ) => Promise<{
      ok: boolean
      query: string
      file: string
      matches: Array<{
        host: string
        port: number
        keyType: string
        hostKeyBase64: string
        hashed: boolean
        line: string
        fingerprint: string
      }>
      error?: string
      missingTool?: boolean
    }>
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
    importSshConfig: () => Promise<import('@shared/ipc').SessionImportPickResult>
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
    exportToFile: () => Promise<{ path: string; count: number } | null>
    importFromFile: (overwrite?: boolean) => Promise<{
      path: string
      upserted: number
      skipped: number
      notes: string[]
    } | null>
  }
  terminal: {
    getPrefs: () => Promise<TerminalPrefs>
    setPrefs: (partial: Partial<TerminalPrefs>) => Promise<TerminalPrefs>
  }
  ai: {
    getSettings: () => Promise<AiSettings>
    testProvider: (req: AiProviderTestInput) => Promise<AiProviderTestResult>
    setSettings: (partial: Partial<AiSettings>) => Promise<void>
    chat: (payload: AiChatPayload) => Promise<void>
    abortChat: () => Promise<void>
    confirmStep: (requestId: string, ok: boolean) => Promise<boolean>
    setSessionProtection?: (sessionId: string, protection: { level: 'normal' | 'production' | 'readonly'; elevated?: boolean } | null) => void
    assist: (req: AiAssistRequest) => Promise<AiAssistResult>
    abortAssist: (requestId: string) => Promise<void>
    parseSshForm: (rawText: string) => Promise<AiParsedSshForm>
    getChatHistory: (key: string) => Promise<AiChatMessage[]>
    setChatHistory: (key: string, messages: AiChatMessage[]) => Promise<void>
    getWorkingMemory: (key: string) => Promise<string | null>
    /** M23: conversations archived by 新对话. Optional so screenshot mocks can omit it. */
    chatArchive?: {
      list: () => Promise<import('@shared/ai-conversation').AiArchiveSummary[]>
      add: (entry: import('@shared/ai-conversation').AiArchivedConversation) => Promise<void>
      take: (id: string) => Promise<AiChatMessage[]>
    }
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
    df: (sessionId: string) => Promise<import('../../shared/server-tools').DfRow[]>
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
    healthProbe: (
      req: import('../../shared/ipc').SshConnectOptions & {
        profileId: string
        reuseSessionId?: string
        extras?: import('../../shared/health-probe').ProbeExtras
      }
    ) => Promise<import('../../shared/health-probe').HealthProbeResult>
    healthProbeSweep: (idleMs: number) => Promise<{ ok: boolean }>
    healthProbeRelease: () => Promise<{ ok: boolean }>
    forwards: {
      list: (sessionId?: string) => Promise<import('@shared/ipc').ActiveForward[]>
      add: (req: import('@shared/ipc').AddForwardRequest) => Promise<import('@shared/ipc').ActiveForward>

      restore: (req: { fromSessionId: string; toSessionId: string; allowRemote: boolean }) => Promise<import('@shared/ipc').ForwardRestoreResult>
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
  recordings: {
    list: () => Promise<Array<{ file: string; host: string; bytes: number; mtime: number }>>
    read: (file: string) => Promise<string>
    delete: (file: string) => Promise<boolean>
  }
  sync: {
    getConfig: () => Promise<{
      provider: 'gist' | 'webdav'
      gistId: string
      webdavUrl: string
      username: string
      hasToken: boolean
      hasPassword: boolean
      hasSyncPassphrase?: boolean
      hasVaultPass?: boolean
      scope: import('../../shared/sync-vault').SyncScope
    } | null>
    setConfig: (patch: unknown) => Promise<unknown>
    test: () => Promise<{ ok: boolean; message: string }>
    push: (payload: unknown, passphrase: string) => Promise<{ ok: boolean; message?: string; id?: string }>
    pull: (passphrase: string) => Promise<{ ok: boolean; message?: string; empty?: boolean; payload?: unknown }>
    backupLocal: (payload: unknown) => Promise<{ ok: boolean; file?: string }>
  }
  files: {
    saveText: (defaultName: string, content: string) => Promise<string | null>
    saveBytes: (defaultName: string, base64: string) => Promise<string | null>
    reveal: (target: string) => Promise<boolean>
  }
  snapshots: {
    list: (query?: { profileId?: string; path?: string }) => Promise<Array<Record<string, unknown>>>
    stats: () => Promise<{ files: number; bytes: number; count: number }>
    put: (input: { profileId: string; path: string; content: string; source: string; stale?: boolean; isText?: boolean; keep?: number; auto?: boolean }) => Promise<{ added: boolean; skipped: string | null; count: number }>
    setPrefs: (prefs: { auto?: boolean; keep?: number }) => Promise<{ auto: boolean; keep: number }>
    read: (id: string) => Promise<{ ok: boolean; content?: string; reason?: string }>
    pin: (id: string, pinned: boolean) => Promise<unknown>
    delete: (id: string) => Promise<{ ok: boolean }>
    clear: () => Promise<{ ok: boolean; n: number }>
    openDir: () => Promise<{ ok: boolean }>
  }
}

declare global {
  interface Window {
    aiss: AissPreload
  }
}

export {}
