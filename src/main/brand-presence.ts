/** TR-1: taskbar title and tray tooltip are the formal product name. No debug path. */
import { app, BrowserWindow, Tray, nativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { trayHoverTitle } from '../shared/product'

let brandTray: Tray | null = null
let brandWindow: BrowserWindow | null = null

function focusBrandWindow(): void {
  const win = brandWindow
  if (!win || win.isDestroyed()) return
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function trayImage(iconPath: string): Electron.NativeImage | null {
  const candidates = [iconPath, iconPath.replace(/\.ico$/i, '.png')]
  for (const file of candidates) {
    if (!existsSync(file)) continue
    const image = nativeImage.createFromPath(file)
    if (!image.isEmpty()) return image.resize({ width: 16, height: 16 })
  }
  return null
}

/** Lock the window title, and when an icon exists, the tray hover name. */
export function applyBrandPresence(win: BrowserWindow, iconPath: string): void {
  const title = trayHoverTitle()
  brandWindow = win
  const lock = (event?: Electron.Event) => {
    event?.preventDefault()
    if (!win.isDestroyed()) win.setTitle(title)
  }
  win.setTitle(title)
  win.on('page-title-updated', lock)
  if (brandTray && !brandTray.isDestroyed()) {
    brandTray.setToolTip(title)
    return
  }
  const image = trayImage(iconPath)
  if (!image) return
  try {
    brandTray = new Tray(image)
    brandTray.setToolTip(title)
    brandTray.on('click', () => focusBrandWindow())
  } catch {
    brandTray = null
  }
}

export function destroyBrandTray(): void {
  if (brandTray && !brandTray.isDestroyed()) brandTray.destroy()
  brandTray = null
  brandWindow = null
}

/** macOS app menu and dock tooltip. Call before the application menu is built. */
export function applyProductAppName(): void {
  app.setName(trayHoverTitle())
}
