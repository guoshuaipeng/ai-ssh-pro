import { app, BrowserWindow, ipcMain, nativeImage, dialog } from 'electron'
import { installApplicationMenu, setMainWindowForMenu, getMainBrowserWindow } from './application-menu'
import { existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SshSessionManager } from './ssh-manager'
import {
  getAiSettings,
  setAiSettings,
  getSavedSessionsState,
  setSavedSessionsState,
  migratePlaintextSecretsToEncrypted,
  getTerminalPrefs,
  setTerminalPrefs,
  getSnippets,
  setSnippets,
  getAiChatHistory,
  setAiChatHistory
} from './app-store'
import { abortAiChat, resolveAiConfirmStep, runOpenClawCoreAgentChat } from './ai-interactive-agent'
import { streamOpenAICompatibleChat } from './ai-stream'
import { setDebugWindowWebContents } from './debug-window-broadcast'
import { parseSshFormWithAi } from './ai-parse-ssh'
import { importSessionFilesFromPaths } from './session-import'
import { resolveHostKeyPrompt } from './host-key-prompt'
import * as sftpManager from './sftp-manager'
import * as dockerManager from './docker-manager'
import { exportSessionsToJson, exportSessionsToOpenSsh } from './session-export'
import { startRecording, stopRecording, stopAllRecordings } from './session-recorder'
import { LocalShellManager, isLocalShellAvailable } from './local-shell'
import { getInventoryStore } from './inventory-store'
import type {
  SavedSessionsState,
  SshConnectOptions,
  AiChatPayload,
  AiSettings,
  SshSnapshotOptions,
  SshHostKeyRespondPayload,
  SessionExportFormat,
  TerminalPrefs,
  CommandSnippet,
  AiChatMessage,
  DockerContainerAction,
  DockerComposeAction
} from '../shared/ipc'
import type { HostInventoryUpsertInput, HostService } from '../shared/inventory'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** Windows：固定到开始菜单 / 任务栏需要稳定的 AppUserModelID */
if (process.platform === 'win32') {
  app.setAppUserModelId('com.aisspro.app')
}

const sshManager = new SshSessionManager()
const localShellManager = new LocalShellManager()

function isLocalSessionId(sessionId: string): boolean {
  return sessionId.startsWith('local:')
}

function appIconPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'icon.ico')
  }
  return join(__dirname, '../../build/icon.ico')
}

function preloadPath(): string {
  const cjs = join(__dirname, '../preload/index.cjs')
  const js = join(__dirname, '../preload/index.js')
  const mjs = join(__dirname, '../preload/index.mjs')
  if (existsSync(cjs)) return cjs
  if (existsSync(js)) return js
  if (existsSync(mjs)) return mjs
  return cjs
}

function logPreloadDiagnostics(resolvedPreload: string): void {
  const abs = resolve(resolvedPreload)
  console.log('[main] —— preload diagnostics ——')
  console.log('[main] __dirname (main bundle) =', __dirname)
  console.log('[main] preload resolved path =', abs)
  console.log('[main] preload file exists =', existsSync(abs))
  if (existsSync(abs)) {
    try {
      const st = statSync(abs)
      console.log('[main] preload size (bytes) =', st.size)
    } catch (e) {
      console.error('[main] stat preload failed', e)
    }
  }
  console.log('[main] ELECTRON_RENDERER_URL =', process.env.ELECTRON_RENDERER_URL ?? '(not set)')
  console.log('[main] NODE_ENV =', process.env.NODE_ENV ?? '(not set)')
  console.log('[main] app.isPackaged =', app.isPackaged)
  console.log('[main] Electron / Chrome =', process.versions.electron, '/', process.versions.chrome)
}

function attachWebContentsDiagnostics(win: BrowserWindow): void {
  const wc = win.webContents

  wc.on('preload-error', (_event, preloadPath, error) => {
    console.error('[main] preload-error: preload script threw')
    console.error('[main]   preloadPath =', preloadPath)
    console.error('[main]   error.name =', error.name, 'message =', error.message)
    console.error('[main]   stack =\n', error.stack)
  })

  wc.on('did-fail-load', (_event, code, desc, url, isMainFrame) => {
    if (isMainFrame) {
      console.error('[main] did-fail-load: code=', code, 'desc=', desc, 'url=', url)
    }
  })

  wc.on('render-process-gone', (_event, details) => {
    console.error('[main] render-process-gone:', details.reason, details.exitCode)
  })

  wc.once('dom-ready', () => {
    console.log('[main] dom-ready')
  })

  wc.once('did-finish-load', () => {
    void (async () => {
      try {
        const hasAiss = await wc.executeJavaScript(
          `typeof window.aiss !== 'undefined' && window.aiss !== null`
        )
        const keys = await wc.executeJavaScript(
          `typeof window.aiss === 'object' && window.aiss !== null ? Object.keys(window.aiss).join(',') : '(无)'`
        )
        console.log('[main] did-finish-load → executeJavaScript: window.aiss exists?', hasAiss)
        console.log('[main] did-finish-load → executeJavaScript: window.aiss keys:', keys)
      } catch (e) {
        console.error('[main] did-finish-load: executeJavaScript failed:', e)
      }
    })()
  })

  if (!app.isPackaged) {
    wc.on('console-message', (_event, level, message, line, sourceId) => {
      const levelName = ['verbose', 'info', 'warning', 'error'][level] ?? String(level)
      console.log(`[renderer-console] ${levelName}: ${message} (${sourceId}:${line})`)
    })
  }
}

/** 与浏览器一致：单独按 F12 切换当前窗口的开发者工具 */
function attachF12ToggleDevTools(win: BrowserWindow): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || input.key !== 'F12') return
    if (input.control || input.alt || input.meta) return
    event.preventDefault()
    win.webContents.toggleDevTools()
  })
}

function createWindow(): void {
  const resolvedPreload = preloadPath()
  logPreloadDiagnostics(resolvedPreload)

  const iconFile = appIconPath()
  const isMac = process.platform === 'darwin'
  const isWin = process.platform === 'win32'
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#161b22',
    show: false,
    webPreferences: {
      preload: resolvedPreload,
      contextIsolation: true,
      nodeIntegration: false,
      // ESM 预加载脚本与 sandbox 并存时，部分环境下 preload 不执行 → window.aiss 不存在
      sandbox: false
    },
    title: 'AI-SSH-Pro',
    ...(existsSync(iconFile) ? { icon: nativeImage.createFromPath(iconFile) } : {}),
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: { x: 14, y: 11 }
        }
      : isWin
        ? {
            titleBarStyle: 'hidden' as const,
            titleBarOverlay: {
              color: '#161b22',
              symbolColor: '#e6edf3',
              height: 36
            },
            // 菜单改由 Alt 唤出，避免再占一行（类似 Cursor 合并标题栏）
            autoHideMenuBar: true
          }
        : {
            autoHideMenuBar: true
          })
  })

  win.once('ready-to-show', () => {
    win.show()
  })

  attachWebContentsDiagnostics(win)
  attachF12ToggleDevTools(win)

  setMainWindowForMenu(win)
  win.on('closed', () => {
    setMainWindowForMenu(null)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    console.log('[main] loadURL (dev) =', process.env.ELECTRON_RENDERER_URL)
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html')
    console.log('[main] loadFile (prod) =', resolve(htmlPath))
    win.loadFile(htmlPath)
  }
}

let debugWindow: BrowserWindow | null = null

function openDebugWindow(): void {
  if (debugWindow && !debugWindow.isDestroyed()) {
    debugWindow.show()
    debugWindow.focus()
    return
  }
  const resolvedPreload = preloadPath()
  const iconFile = appIconPath()
  const w = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 440,
    title: 'AI 助手调试',
    show: false,
    webPreferences: {
      preload: resolvedPreload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    ...(existsSync(iconFile) ? { icon: nativeImage.createFromPath(iconFile) } : {})
  })
  attachWebContentsDiagnostics(w)
  attachF12ToggleDevTools(w)
  setDebugWindowWebContents(w.webContents)
  w.on('closed', () => {
    setDebugWindowWebContents(null)
    debugWindow = null
  })
  w.once('ready-to-show', () => {
    w.show()
    w.focus()
  })
  debugWindow = w

  if (process.env.ELECTRON_RENDERER_URL) {
    try {
      const raw = process.env.ELECTRON_RENDERER_URL.trim()
      const u = new URL(raw)
      u.searchParams.set('ai-debug', '1')
      const target = u.toString()
      console.log('[main] debug window loadURL =', target)
      void w.loadURL(target).catch((err) => {
        console.error('[main] debug window loadURL failed:', err)
      })
    } catch (e) {
      console.error('[main] debug window: invalid ELECTRON_RENDERER_URL', process.env.ELECTRON_RENDERER_URL, e)
      const fallback = `${process.env.ELECTRON_RENDERER_URL.replace(/\/$/, '')}/?ai-debug=1`
      void w.loadURL(fallback).catch((err) => console.error('[main] debug window fallback load failed:', err))
    }
  } else {
    const htmlPath = join(__dirname, '../renderer/index.html')
    void w
      .loadFile(htmlPath, { query: { 'ai-debug': '1' } })
      .catch((err) => console.error('[main] debug window loadFile failed:', err))
  }
}

function registerIpc(): void {
  ipcMain.handle('ssh:connect', async (event, opts: SshConnectOptions) => {
    return await sshManager.connect(opts, event.sender)
  })

  ipcMain.handle('ssh:openLocalShell', (event) => {
    return localShellManager.open(event.sender)
  })

  ipcMain.handle('ssh:isLocalShellAvailable', () => isLocalShellAvailable())

  ipcMain.handle('ssh:disconnect', (_e, sessionId: string) => {
    stopRecording(sessionId)
    if (isLocalSessionId(sessionId)) localShellManager.disconnect(sessionId)
    else sshManager.disconnect(sessionId)
  })

  ipcMain.handle('ssh:write', (_e, sessionId: string, data: string | Uint8Array | number[]) => {
    const payload =
      typeof data === 'string' ? data : data instanceof Uint8Array ? data : Uint8Array.from(data)
    if (isLocalSessionId(sessionId)) {
      if (typeof payload !== 'string') return false
      return localShellManager.write(sessionId, payload)
    }
    return sshManager.write(sessionId, payload)
  })

  ipcMain.handle('ssh:resize', (_e, sessionId: string, cols: number, rows: number) => {
    if (isLocalSessionId(sessionId)) return localShellManager.resize(sessionId, cols, rows)
    return sshManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle('ssh:getSnapshot', (_e, sessionId: string, options?: number | SshSnapshotOptions) => {
    if (isLocalSessionId(sessionId)) {
      const max = typeof options === 'number' ? options : options?.maxLines ?? 200
      return localShellManager.getRingSnapshot(sessionId, max)
    }
    return sshManager.getRingSnapshot(sessionId, options ?? 200)
  })

  ipcMain.handle('ssh:respondHostKey', (_e, payload: SshHostKeyRespondPayload) => {
    return resolveHostKeyPrompt(payload.requestId, Boolean(payload.accept), payload.alwaysTrust !== false)
  })

  ipcMain.handle('ssh:startRecording', async (_e, sessionId: string) => {
    const parent = BrowserWindow.getFocusedWindow() ?? getMainBrowserWindow()
    const { canceled, filePath } = parent
      ? await dialog.showSaveDialog(parent, {
          title: '保存会话录制',
          defaultPath: `session-${sessionId.slice(0, 8)}.log`,
          filters: [{ name: 'Log', extensions: ['log', 'txt'] }]
        })
      : await dialog.showSaveDialog({
          title: '保存会话录制',
          defaultPath: `session-${sessionId.slice(0, 8)}.log`,
          filters: [{ name: 'Log', extensions: ['log', 'txt'] }]
        })
    if (canceled || !filePath) return null
    startRecording(sessionId, filePath)
    return filePath
  })

  ipcMain.handle('ssh:stopRecording', (_e, sessionId: string) => stopRecording(sessionId))

  const requireSshClient = (sessionId: string) => {
    const client = sshManager.getClient(sessionId)
    if (!client) throw new Error('会话不存在或未连接（SFTP 仅支持 SSH 会话）')
    return client
  }

  ipcMain.handle('sftp:list', async (_e, sessionId: string, remotePath: string) => {
    return await sftpManager.list(requireSshClient(sessionId), remotePath)
  })
  ipcMain.handle('sftp:home', async (_e, sessionId: string) => {
    return await sftpManager.home(requireSshClient(sessionId))
  })
  ipcMain.handle(
    'sftp:download',
    async (_e, sessionId: string, remotePath: string, localPath: string, transferId?: string) => {
      const client = requireSshClient(sessionId)
      const name = remotePath.replace(/\\/g, '/').split('/').pop() || 'download.bin'
      const tid = transferId || `dl-${Date.now()}`
      const win = BrowserWindow.fromWebContents(_e.sender)
      const sendProg = (transferred: number, total: number, done?: boolean, error?: string) => {
        if (!win || win.isDestroyed()) return
        win.webContents.send('sftp:progress', {
          transferId: tid,
          sessionId,
          direction: 'download',
          name,
          transferred,
          total,
          done,
          error
        })
      }
      try {
        await sftpManager.download(client, remotePath, localPath, (p) =>
          sendProg(p.transferred, p.total)
        )
        sendProg(1, 1, true)
      } catch (e) {
        sendProg(0, 0, true, e instanceof Error ? e.message : String(e))
        throw e
      }
    }
  )
  ipcMain.handle(
    'sftp:upload',
    async (_e, sessionId: string, localPath: string, remotePath: string, transferId?: string) => {
      const client = requireSshClient(sessionId)
      const remote = sftpManager.resolveUploadRemotePath(localPath, remotePath)
      const name = localPath.replace(/\\/g, '/').split('/').pop() || 'upload.bin'
      const tid = transferId || `ul-${Date.now()}`
      const win = BrowserWindow.fromWebContents(_e.sender)
      const sendProg = (transferred: number, total: number, done?: boolean, error?: string) => {
        if (!win || win.isDestroyed()) return
        win.webContents.send('sftp:progress', {
          transferId: tid,
          sessionId,
          direction: 'upload',
          name,
          transferred,
          total,
          done,
          error
        })
      }
      try {
        await sftpManager.upload(client, localPath, remote, (p) => sendProg(p.transferred, p.total))
        sendProg(1, 1, true)
      } catch (e) {
        sendProg(0, 0, true, e instanceof Error ? e.message : String(e))
        throw e
      }
    }
  )
  ipcMain.handle('sftp:mkdir', async (_e, sessionId: string, remotePath: string) => {
    await sftpManager.mkdir(requireSshClient(sessionId), remotePath)
  })
  ipcMain.handle('sftp:remove', async (_e, sessionId: string, remotePath: string) => {
    await sftpManager.remove(requireSshClient(sessionId), remotePath)
  })
  ipcMain.handle('sftp:rename', async (_e, sessionId: string, fromPath: string, toPath: string) => {
    await sftpManager.rename(requireSshClient(sessionId), fromPath, toPath)
  })
  ipcMain.handle('sftp:readText', async (_e, sessionId: string, remotePath: string, maxBytes?: number) => {
    return await sftpManager.readText(
      requireSshClient(sessionId),
      remotePath,
      typeof maxBytes === 'number' ? maxBytes : undefined
    )
  })
  ipcMain.handle('sftp:writeText', async (_e, sessionId: string, remotePath: string, content: string) => {
    await sftpManager.writeText(requireSshClient(sessionId), remotePath, String(content ?? ''))
    return true
  })
  ipcMain.handle('sftp:pickDownloadPath', async (_e, defaultName?: string) => {
    const parent = BrowserWindow.getFocusedWindow() ?? getMainBrowserWindow()
    const { canceled, filePath } = parent
      ? await dialog.showSaveDialog(parent, { title: '下载到…', defaultPath: defaultName || 'download.bin' })
      : await dialog.showSaveDialog({ title: '下载到…', defaultPath: defaultName || 'download.bin' })
    return canceled || !filePath ? null : filePath
  })
  ipcMain.handle('sftp:pickUploadFiles', async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? getMainBrowserWindow()
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, {
          title: '上传文件',
          properties: ['openFile', 'multiSelections']
        })
      : await dialog.showOpenDialog({ title: '上传文件', properties: ['openFile', 'multiSelections'] })
    return canceled || !filePaths?.length ? null : filePaths
  })
  ipcMain.handle('sftp:pickSavePaths', async (_e, names: string[]) => {
    const parent = BrowserWindow.getFocusedWindow() ?? getMainBrowserWindow()
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, {
          title: '选择下载保存目录',
          properties: ['openDirectory', 'createDirectory']
        })
      : await dialog.showOpenDialog({
          title: '选择下载保存目录',
          properties: ['openDirectory', 'createDirectory']
        })
    if (canceled || !filePaths?.[0]) return null
    const dir = filePaths[0]
    const list = Array.isArray(names) ? names : []
    return list.map((n) => {
      const safe = String(n || 'file').replace(/[<>:"|?*]/g, '_')
      return join(dir, safe)
    })
  })

  ipcMain.handle('docker:listTree', async (_e, sessionId: string) => {
    return await dockerManager.listTree(requireSshClient(sessionId))
  })
  ipcMain.handle(
    'docker:containerAction',
    async (_e, sessionId: string, containerId: string, action: DockerContainerAction) => {
      await dockerManager.containerAction(requireSshClient(sessionId), containerId, action)
      return true
    }
  )
  ipcMain.handle('docker:logs', async (_e, sessionId: string, containerId: string, tail?: number) => {
    return await dockerManager.containerLogs(requireSshClient(sessionId), containerId, tail)
  })
  ipcMain.handle('docker:composePs', async (_e, sessionId: string, project: string) => {
    return await dockerManager.composePs(requireSshClient(sessionId), project)
  })
  ipcMain.handle(
    'docker:composeAction',
    async (_e, sessionId: string, project: string, action: DockerComposeAction) => {
      await dockerManager.composeAction(requireSshClient(sessionId), project, action)
      return true
    }
  )

  ipcMain.handle(
    'docker:openShell',
    async (
      event,
      parentSessionId: string,
      containerId: string,
      opts?: { termCols?: number; termRows?: number; label?: string }
    ) => {
      return await sshManager.openDockerExec(String(parentSessionId || ''), String(containerId || ''), event.sender, opts)
    }
  )

  ipcMain.handle('fs:writeFile', async (_e, filePath: string, data: number[] | Uint8Array) => {
    const { writeFile } = await import('node:fs/promises')
    const buf = data instanceof Uint8Array ? Buffer.from(data) : Buffer.from(Uint8Array.from(data || []))
    await writeFile(String(filePath || ''), buf)
    return true
  })

  ipcMain.handle('sessions:list', () => getSavedSessionsState())
  ipcMain.handle('sessions:save', (_e, state: SavedSessionsState) => {
    setSavedSessionsState(state)
  })
  ipcMain.handle('sessions:importPick', async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? getMainBrowserWindow()
    const dlgOpts: Electron.OpenDialogOptions = {
      title: '导入会话（Xshell .xsh / OpenSSH config / PuTTY .reg）',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '会话配置', extensions: ['xsh', 'config', 'reg'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    }
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, dlgOpts)
      : await dialog.showOpenDialog(dlgOpts)
    if (canceled || !filePaths?.length) return null
    return await importSessionFilesFromPaths(filePaths)
  })
  ipcMain.handle('sessions:export', (_e, format: SessionExportFormat) => {
    const state = getSavedSessionsState()
    return format === 'openssh' ? exportSessionsToOpenSsh(state) : exportSessionsToJson(state)
  })

  ipcMain.handle('snippets:list', () => getSnippets())
  ipcMain.handle('snippets:save', (_e, list: CommandSnippet[]) => {
    setSnippets(list)
  })

  ipcMain.handle('inventory:list', () => getInventoryStore().list())
  ipcMain.handle('inventory:get', (_e, id: string) => getInventoryStore().get(String(id || '')))
  ipcMain.handle('inventory:search', (_e, query: string) => getInventoryStore().search(String(query || '')))
  ipcMain.handle('inventory:upsert', (_e, input: HostInventoryUpsertInput) => getInventoryStore().upsert(input))
  ipcMain.handle('inventory:remove', (_e, id: string) => getInventoryStore().remove(String(id || '')))
  ipcMain.handle('inventory:getRoot', () => getInventoryStore().root)
  ipcMain.handle(
    'inventory:upsertService',
    (_e, hostId: string, service: HostService) => getInventoryStore().upsertService(hostId, service)
  )
  ipcMain.handle('inventory:appendNote', (_e, hostId: string, note: string) =>
    getInventoryStore().appendNote(hostId, note)
  )

  ipcMain.handle('terminal:getPrefs', () => getTerminalPrefs())
  ipcMain.handle('terminal:setPrefs', (_e, partial: Partial<TerminalPrefs>) => setTerminalPrefs(partial))

  ipcMain.handle('ai:settings:get', () => getAiSettings())
  ipcMain.handle('ai:settings:set', (_e, partial: Partial<AiSettings>) => {
    setAiSettings(partial)
  })

  ipcMain.handle('ai:chat', async (event, payload: AiChatPayload) => {
    const settings = getAiSettings()
    if (settings.useOpenClaw === false) {
      await streamOpenAICompatibleChat(event.sender, settings, payload)
    } else {
      await runOpenClawCoreAgentChat(event.sender, settings, payload, sshManager)
    }
  })

  ipcMain.handle('ai:abortChat', () => {
    abortAiChat()
  })

  ipcMain.handle('ai:confirmStep', async (_event, requestId: string, ok: boolean) => {
    return resolveAiConfirmStep(requestId, Boolean(ok))
  })

  ipcMain.handle('ai:parseSshForm', async (_e, rawText: string) => {
    return await parseSshFormWithAi(rawText, getAiSettings())
  })

  ipcMain.handle('ai:chatHistory:get', (_e, key: string) => getAiChatHistory(key))
  ipcMain.handle('ai:chatHistory:set', (_e, key: string, messages: AiChatMessage[]) => {
    setAiChatHistory(key, messages)
  })

  ipcMain.handle('debug:openWindow', () => {
    openDebugWindow()
  })
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  // 已有实例：尽快退出，把焦点交给第一个进程的 second-instance
  app.exit(0)
} else {
  /** 无窗口空闲一段时间后再退出，避免关窗后立刻再点图标撞上「锁还在、进程已死」 */
  const IDLE_QUIT_MS = 120_000
  let idleQuitTimer: ReturnType<typeof setTimeout> | null = null
  let isQuitting = false

  const clearIdleQuitTimer = () => {
    if (idleQuitTimer) {
      clearTimeout(idleQuitTimer)
      idleQuitTimer = null
    }
  }

  const cleanupSessions = () => {
    try {
      stopAllRecordings()
    } catch {
      /* ignore */
    }
    try {
      sshManager.disconnectAll()
    } catch {
      /* ignore */
    }
    try {
      localShellManager.disconnectAll()
    } catch {
      /* ignore */
    }
  }

  const scheduleIdleQuit = () => {
    clearIdleQuitTimer()
    idleQuitTimer = setTimeout(() => {
      idleQuitTimer = null
      if (BrowserWindow.getAllWindows().some((w) => !w.isDestroyed())) return
      isQuitting = true
      try {
        app.releaseSingleInstanceLock()
      } catch {
        /* ignore */
      }
      app.quit()
    }, IDLE_QUIT_MS)
  }

  const focusOrCreateMainWindow = () => {
    clearIdleQuitTimer()
    const fromRef = getMainBrowserWindow()
    const existing =
      fromRef && !fromRef.isDestroyed()
        ? fromRef
        : BrowserWindow.getAllWindows().find((w) => !w.isDestroyed()) ?? null
    if (existing) {
      if (existing.isMinimized()) existing.restore()
      existing.show()
      existing.focus()
      return
    }
    if (app.isReady()) createWindow()
  }

  app.on('second-instance', () => {
    // 关窗后进程仍在：再点图标只唤起/重建窗口，不会出现「要点两次」
    focusOrCreateMainWindow()
  })

  app.on('before-quit', () => {
    isQuitting = true
    clearIdleQuitTimer()
    cleanupSessions()
  })

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return
    cleanupSessions()
    // 菜单退出过程中不要再排程；否则关窗后进程保活，第一次点击即可开窗
    if (isQuitting) return
    scheduleIdleQuit()
  })

  app.whenReady().then(() => {
    console.log('[main] app ready, userData =', app.getPath('userData'))
    migratePlaintextSecretsToEncrypted()
    registerIpc()
    installApplicationMenu()
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}
