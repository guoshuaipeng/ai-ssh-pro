import { app, BrowserWindow, ipcMain } from 'electron'
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
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

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      // ESM 预加载脚本与 sandbox 并存时，部分环境下 preload 不执行 → window.aiss 不存在
      sandbox: false
    },
    title: 'AI-SSH-Pro'
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
    win.webContents.openDevTools({ mode: 'detach' })
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
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
  registerIpc()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
