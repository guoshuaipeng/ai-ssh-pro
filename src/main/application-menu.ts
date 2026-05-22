import { app, BrowserWindow, Menu } from 'electron'
import type { AppDialogKind } from '../shared/ipc'

let mainWindowRef: BrowserWindow | null = null

export function setMainWindowForMenu(win: BrowserWindow | null): void {
  mainWindowRef = win
}

/** 文件对话框等需要父窗口时优先用主窗口 */
export function getMainBrowserWindow(): BrowserWindow | null {
  return mainWindowRef
}

function sendOpenDialog(kind: AppDialogKind): void {
  const w = BrowserWindow.getFocusedWindow() ?? mainWindowRef
  if (w && !w.isDestroyed()) {
    w.webContents.send('app:open-dialog', kind)
  }
}

export function installApplicationMenu(): void {
  const isMac = process.platform === 'darwin'

  const template: Electron.MenuItemConstructorOptions[] = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push({
    label: '会话',
    submenu: [
      {
        label: '新建连接…',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => sendOpenDialog('connection')
      },
      {
        label: 'AI 配置…',
        accelerator: 'CmdOrCtrl+,',
        click: () => sendOpenDialog('ai')
      },
      {
        label: 'AI 助手调试…',
        click: () => sendOpenDialog('debug')
      }
    ]
  })

  template.push({
    label: '编辑',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' }
    ]
  })

  template.push({
    label: isMac ? '显示' : '查看',
    submenu: [
      {
        label: '切换开发者工具',
        accelerator: 'F12',
        click: (_item, focusedWindow) => {
          const w = (focusedWindow ?? BrowserWindow.getFocusedWindow()) as BrowserWindow | null
          if (w && !w.isDestroyed()) w.webContents.toggleDevTools()
        }
      }
    ]
  })

  if (!isMac) {
    template.push({
      label: '文件',
      submenu: [{ role: 'quit' }]
    })
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
