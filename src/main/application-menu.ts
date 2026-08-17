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
        label: '新建连接',
        accelerator: 'CmdOrCtrl+Shift+N',
        click: () => sendOpenDialog('connection')
      },
      {
        label: '本机 Shell',
        click: () => sendOpenDialog('localShell')
      },
      {
        label: '文件传输',
        accelerator: 'CmdOrCtrl+Shift+F',
        click: () => sendOpenDialog('sftp')
      },
      {
        label: '刷新 Docker',
        accelerator: 'CmdOrCtrl+Shift+D',
        click: () => sendOpenDialog('refreshDocker')
      },
      { type: 'separator' },
      {
        label: '新建文件夹',
        click: () => sendOpenDialog('newFolder')
      },
      {
        label: '导入会话…',
        click: () => sendOpenDialog('importSessions')
      },
      {
        label: '导出 OpenSSH…',
        click: () => sendOpenDialog('exportOpenssh')
      },
      {
        label: '导出 JSON…',
        click: () => sendOpenDialog('exportJson')
      },
      { type: 'separator' },
      {
        label: '分屏',
        click: () => sendOpenDialog('toggleSplit')
      },
      {
        label: '切换广播输入',
        click: () => sendOpenDialog('toggleBroadcast')
      },
      {
        label: '开始/停止录制',
        click: () => sendOpenDialog('toggleRecording')
      },
      { type: 'separator' },
      {
        label: 'AI 配置',
        accelerator: 'CmdOrCtrl+,',
        click: () => sendOpenDialog('ai')
      },
      {
        label: 'AI 助手调试…',
        click: () => sendOpenDialog('debug')
      },
      { type: 'separator' },
      {
        label: '命令片段',
        click: () => sendOpenDialog('snippets')
      },
      {
        label: '主机档案',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => sendOpenDialog('inventory')
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
        label: '切换左侧会话栏',
        accelerator: 'CmdOrCtrl+B',
        click: () => sendOpenDialog('toggleSidebar')
      },
      {
        label: '切换中间终端区',
        click: () => sendOpenDialog('toggleMain')
      },
      {
        label: '切换右侧 AI 面板',
        accelerator: 'CmdOrCtrl+Alt+B',
        click: () => sendOpenDialog('toggleAi')
      },
      { type: 'separator' },
      {
        label: '界面主题',
        click: () => sendOpenDialog('uiTheme')
      },
      {
        label: '终端外观',
        click: () => sendOpenDialog('terminalPrefs')
      },
      { type: 'separator' },
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
