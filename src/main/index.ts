import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { SshSessionManager } from './ssh-manager'
import { appStore, getAiSettings, setAiSettings } from './app-store'
import { streamOpenAICompatibleChat } from './ai-stream'
import type { SavedSessionProfile, SshConnectOptions, AiChatPayload, AiSettings } from '../shared/ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))

const sshManager = new SshSessionManager()

function preloadPath(): string {
  const js = join(__dirname, '../preload/index.js')
  const mjs = join(__dirname, '../preload/index.mjs')
  if (existsSync(js)) return js
  if (existsSync(mjs)) return mjs
  return js
}

function logPreloadDiagnostics(resolvedPreload: string): void {
  const abs = resolve(resolvedPreload)
  console.log('[main] —— preload 诊断 ——')
  console.log('[main] __dirname (main bundle) =', __dirname)
  console.log('[main] preload 配置路径 =', abs)
  console.log('[main] preload 文件存在 =', existsSync(abs))
  if (existsSync(abs)) {
    try {
      const st = statSync(abs)
      console.log('[main] preload 文件大小(bytes) =', st.size)
    } catch (e) {
      console.error('[main] stat preload 失败', e)
    }
  }
  console.log('[main] ELECTRON_RENDERER_URL =', process.env.ELECTRON_RENDERER_URL ?? '(未设置)')
  console.log('[main] NODE_ENV =', process.env.NODE_ENV ?? '(未设置)')
  console.log('[main] app.isPackaged =', app.isPackaged)
  console.log('[main] Electron / Chrome =', process.versions.electron, '/', process.versions.chrome)
}

function attachWebContentsDiagnostics(win: BrowserWindow): void {
  const wc = win.webContents

  wc.on('preload-error', (_event, preloadPath, error) => {
    console.error('[main] preload-error: 预加载脚本抛错')
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
        console.log('[main] did-finish-load → executeJavaScript: window.aiss 存在?', hasAiss)
        console.log('[main] did-finish-load → window.aiss 键:', keys)
      } catch (e) {
        console.error('[main] did-finish-load 后 executeJavaScript 失败:', e)
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

function createWindow(): void {
  const resolvedPreload = preloadPath()
  logPreloadDiagnostics(resolvedPreload)

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
    title: 'AI-SSH-Pro'
  })

  attachWebContentsDiagnostics(win)

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

  ipcMain.handle('ssh:getSnapshot', (_e, sessionId: string, maxLines?: number) => {
    return sshManager.getRingSnapshot(sessionId, maxLines ?? 200)
  })

  ipcMain.handle('sessions:list', () => {
    return appStore.get('savedSessions') as SavedSessionProfile[]
  })

  ipcMain.handle('sessions:save', (_e, list: SavedSessionProfile[]) => {
    appStore.set('savedSessions', list)
  })

  ipcMain.handle('ai:settings:get', () => getAiSettings())
  ipcMain.handle('ai:settings:set', (_e, partial: Partial<AiSettings>) => {
    setAiSettings(partial)
  })

  ipcMain.handle('ai:chat', async (event, payload: AiChatPayload) => {
    await streamOpenAICompatibleChat(event.sender, getAiSettings(), payload)
  })
}

app.whenReady().then(() => {
  console.log('[main] app ready, userData =', app.getPath('userData'))
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
