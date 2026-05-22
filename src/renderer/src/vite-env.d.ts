/// <reference types="vite/client" />

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
} from '@shared/ipc'

export type AissPreload = {
  app: {
    onOpenDialog: (cb: (kind: AppDialogKind) => void) => () => void
  }
  ssh: {
    connect: (opts: SshConnectOptions) => Promise<SshConnectResult>
    disconnect: (sessionId: string) => Promise<void>
    write: (sessionId: string, data: string) => Promise<boolean>
    resize: (sessionId: string, cols: number, rows: number) => Promise<boolean>
    getSnapshot: (sessionId: string, options?: number | SshSnapshotOptions) => Promise<string | null>
    onData: (cb: (payload: SshDataEvent) => void) => () => void
    onStatus: (cb: (payload: SshStatusEvent) => void) => () => void
  }
  sessions: {
    list: () => Promise<SavedSessionsState>
    save: (state: SavedSessionsState) => Promise<void>
    importPick: () => Promise<SessionImportPickResult | null>
  }
  ai: {
    getSettings: () => Promise<AiSettings>
    setSettings: (partial: Partial<AiSettings>) => Promise<void>
    chat: (payload: AiChatPayload) => Promise<void>
    abortChat: () => Promise<void>
    confirmStep: (requestId: string, ok: boolean) => Promise<boolean>
    parseSshForm: (rawText: string) => Promise<AiParsedSshForm>
    onStream: (cb: (ev: AiStreamEvent) => void) => () => void
  }
  debug: {
    openWindow: () => Promise<void>
    onPush: (cb: (payload: AiDebugStreamPayload) => void) => () => void
  }
}

declare global {
  interface Window {
    aiss: AissPreload
  }
}

export {}
