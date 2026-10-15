import { app, BrowserWindow, Menu } from 'electron'
import type { AppDialogKind } from '../shared/ipc'
import { SHARED_MENUS, visibleMenuItems, type MenuAction } from '../shared/menus'
import { mt } from './main-i18n'

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

/** Edit actions keep Electron's native roles so text inputs behave as usual. */
const ROLE_ITEMS: Partial<Record<MenuAction, Electron.MenuItemConstructorOptions['role']>> = {
  undo: 'undo',
  redo: 'redo',
  copy: 'copy',
  paste: 'paste',
  selectAll: 'selectAll',
  quit: 'quit'
}

/**
 * Builds the application menu from the shared definition (UX-03).
 * Shortcuts are displayed but not registered here: the renderer's keymap handler owns them,
 * so nothing steals Ctrl+letter from a focused terminal (UX-01).
 */
export function buildMenuTemplate(isMac = process.platform === 'darwin'): Electron.MenuItemConstructorOptions[] {
  const template: Electron.MenuItemConstructorOptions[] = []
  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { label: mt('关于 AI-SSH-Pro', 'About AI-SSH-Pro'), click: () => sendOpenDialog('about') },
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
  for (const menu of SHARED_MENUS) {
    const submenu: Electron.MenuItemConstructorOptions[] = []
    for (const item of visibleMenuItems(menu)) {
      if (item.type === 'sep') {
        submenu.push({ type: 'separator' })
        continue
      }
      if (isMac && (item.id === 'quit' || item.id === 'about')) continue
      const label = mt(item.label.zh, item.label.en)
      const role = ROLE_ITEMS[item.id]
      if (role) {
        submenu.push({ role, label })
        continue
      }
      const accel = item.shortcut && !item.shortcut.includes('…') ? item.shortcut.replace(/^Ctrl\+/, 'CmdOrCtrl+') : undefined
      submenu.push({
        label,
        accelerator: accel,
        registerAccelerator: false,
        click: () => sendOpenDialog(item.id)
      })
    }
    if (menu.id === 'view') {
      submenu.push(
        { type: 'separator' },
        {
          label: mt('开发者工具', 'Developer tools'),
          accelerator: 'F12',
          click: (_item, focusedWindow) => {
            const w = (focusedWindow ?? BrowserWindow.getFocusedWindow()) as BrowserWindow | null
            if (w && !w.isDestroyed()) w.webContents.toggleDevTools()
          }
        }
      )
    }
    while (submenu.length && submenu[submenu.length - 1]!.type === 'separator') submenu.pop()
    template.push({ label: mt(menu.label.zh, menu.label.en), submenu })
  }
  return template
}

export function installApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildMenuTemplate()))
}
