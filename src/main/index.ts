import { app, BrowserWindow, ipcMain, nativeImage, dialog } from 'electron'
import { installApplicationMenu, setMainWindowForMenu, getMainBrowserWindow } from './application-menu'
import { existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SshSessionManager } from './ssh-manager'
import { getAiSettings, setAiSettings, getSavedSessionsState, setSavedSessionsState } from './app-store'
import { abortAiChat, resolveAiConfirmStep, runOpenClawCoreAgentChat } from './ai-interactive-agent'
import { streamOpenAICompatibleChat } from './ai-stream'
import { setDebugWindowWebContents } from './debug-window-broadcast'
import { parseSshFormWithAi } from './ai-parse-ssh'
import { importSessionFilesFromPaths } from './session-import'
import type { SavedSessionsState, SshConnectOptions, AiChatPayload, AiSettings, SshSnapshotOptions } from '../shared/ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))

const sshManager = new SshSessionManager()

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
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: resolvedPreload,
      contextIsolation: true,
      nodeIntegration: false,
      // ESM 预加载脚本与 sandbox 并存时，部分环境下 preload 不执行 → window.aiss 不存在
      sandbox: false
    },
    title: 'AI-SSH-Pro',
    ...(existsSync(iconFile) ? { icon: nativeImage.createFromPath(iconFile) } : {})
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

  ipcMain.handle('ssh:disconnect', (_e, sessionId: string) => {
    sshManager.disconnect(sessionId)
  })

  ipcMain.handle('ssh:write', (_e, sessionId: string, data: string) => {
    return sshManager.write(sessionId, data)
  })

  ipcMain.handle('ssh:resize', (_e, sessionId: string, cols: number, rows: number) => {
    return sshManager.resize(sessionId, cols, rows)
  })

  ipcMain.handle('ssh:getSnapshot', (_e, sessionId: string, options?: number | SshSnapshotOptions) => {
    return sshManager.getRingSnapshot(sessionId, options ?? 200)
  })

  ipcMain.handle('sessions:list', () => {
    return getSavedSessionsState()
  })

  ipcMain.handle('sessions:save', (_e, state: SavedSessionsState) => {
    setSavedSessionsState(state)
  })

  ipcMain.handle('sessions:importPick', async () => {
    const parent = BrowserWindow.getFocusedWindow() ?? getMainBrowserWindow()
    const dlgOpts: Electron.OpenDialogOptions = {
      title: '导入会话（Xshell .xsh / OpenSSH config）',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Xshell / SSH 配置', extensions: ['xsh', 'config'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    }
    const { canceled, filePaths } = parent
      ? await dialog.showOpenDialog(parent, dlgOpts)
      : await dialog.showOpenDialog(dlgOpts)
    if (canceled || !filePaths?.length) return null
    return await importSessionFilesFromPaths(filePaths)
  })

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

  ipcMain.handle('debug:openWindow', () => {
    openDebugWindow()
  })
}

app.whenReady().then(() => {
  console.log('[main] app ready, userData =', app.getPath('userData'))
  registerIpc()
  installApplicationMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
