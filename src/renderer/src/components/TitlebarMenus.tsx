import { useEffect, useRef, useState } from 'react'
import type { AppDialogKind } from '@shared/ipc'
import { useI18n, type MessageKey } from '../lib/i18n'

export type TitlebarMenuAction =
  | AppDialogKind
  | 'quit'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'batchExec'
  | 'shortcuts'

type MenuItem =
  | { type: 'item'; id: TitlebarMenuAction; label: MessageKey; shortcut?: string }
  | { type: 'sep' }

type MenuDef = { id: string; label: MessageKey; items: MenuItem[] }

const MENUS: MenuDef[] = [
  {
    id: 'session',
    label: 'menu.session',
    items: [
      { type: 'item', id: 'connection', label: 'menu.newConnection', shortcut: 'Ctrl+Shift+N' },
      { type: 'item', id: 'localShell', label: 'menu.localShell' },
      { type: 'item', id: 'sftp', label: 'menu.sftp', shortcut: 'Ctrl+Shift+F' },
      { type: 'item', id: 'refreshDocker', label: 'menu.refreshDocker', shortcut: 'Ctrl+Shift+D' },
      { type: 'sep' },
      { type: 'item', id: 'batchExec', label: 'menu.batchExec' },
      { type: 'sep' },
      { type: 'item', id: 'newFolder', label: 'menu.newFolder' },
      { type: 'item', id: 'importSessions', label: 'menu.importSessions' },
      { type: 'item', id: 'exportOpenssh', label: 'menu.exportOpenssh' },
      { type: 'item', id: 'exportJson', label: 'menu.exportJson' },
      { type: 'sep' },
      { type: 'item', id: 'toggleSplit', label: 'menu.split' },
      { type: 'item', id: 'toggleBroadcast', label: 'menu.broadcast' },
      { type: 'item', id: 'toggleRecording', label: 'menu.recording' },
      { type: 'sep' },
      { type: 'item', id: 'ai', label: 'menu.ai', shortcut: 'Ctrl+,' },
      { type: 'item', id: 'debug', label: 'menu.debug' },
      { type: 'sep' },
      { type: 'item', id: 'snippets', label: 'menu.snippets' },
      { type: 'item', id: 'inventory', label: 'menu.inventory', shortcut: 'Ctrl+Shift+H' },
      { type: 'item', id: 'mcpGuide', label: 'menu.mcpGuide' }
    ]
  },
  {
    id: 'edit',
    label: 'menu.edit',
    items: [
      { type: 'item', id: 'undo', label: 'menu.undo', shortcut: 'Ctrl+Z' },
      { type: 'item', id: 'redo', label: 'menu.redo', shortcut: 'Ctrl+Y' },
      { type: 'sep' },
      { type: 'item', id: 'cut', label: 'menu.cut', shortcut: 'Ctrl+X' },
      { type: 'item', id: 'copy', label: 'menu.copy', shortcut: 'Ctrl+C' },
      { type: 'item', id: 'paste', label: 'menu.paste', shortcut: 'Ctrl+V' },
      { type: 'item', id: 'selectAll', label: 'menu.selectAll', shortcut: 'Ctrl+A' }
    ]
  },
  {
    id: 'view',
    label: 'menu.view',
    items: [
      { type: 'item', id: 'toggleSidebar', label: 'menu.toggleSidebar', shortcut: 'Ctrl+B' },
      { type: 'item', id: 'toggleMain', label: 'menu.toggleMain' },
      { type: 'item', id: 'toggleAi', label: 'menu.toggleAi', shortcut: 'Ctrl+Alt+B' },
      { type: 'sep' },
      { type: 'item', id: 'uiTheme', label: 'menu.uiTheme' },
      { type: 'item', id: 'terminalPrefs', label: 'menu.terminalPrefs' }
    ]
  },
  {
    id: 'file',
    label: 'menu.file',
    items: [{ type: 'item', id: 'quit', label: 'menu.quit', shortcut: 'Alt+F4' }]
  },
  {
    id: 'help',
    label: 'menu.help',
    items: [
      { type: 'item', id: 'shortcuts', label: 'menu.shortcuts', shortcut: 'F1' },
      { type: 'item', id: 'about', label: 'menu.about' }
    ]
  }
]

type Props = {
  onAction: (action: TitlebarMenuAction) => void
}

/** 标题栏内嵌菜单（替代被隐藏的系统菜单栏） */
export default function TitlebarMenus({ onAction }: Props) {
  const { t } = useI18n()
  const [openId, setOpenId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!openId) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenId(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenId(null)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [openId])

  return (
    <div className="titlebar-menus" ref={rootRef} role="menubar">
      {MENUS.map((menu) => {
        const open = openId === menu.id
        return (
          <div key={menu.id} className={`titlebar-menu ${open ? 'is-open' : ''}`}>
            <button
              type="button"
              className="titlebar-menu-trigger"
              aria-haspopup="true"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : menu.id)}
              onMouseEnter={() => {
                if (openId) setOpenId(menu.id)
              }}
            >
              {t(menu.label)}
            </button>
            {open ? (
              <div className="titlebar-menu-dropdown" role="menu">
                {menu.items.map((item, i) =>
                  item.type === 'sep' ? (
                    <div key={`sep-${menu.id}-${i}`} className="titlebar-menu-sep" />
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      className="titlebar-menu-item"
                      role="menuitem"
                      onClick={() => {
                        setOpenId(null)
                        onAction(item.id)
                      }}
                    >
                      <span>{t(item.label)}</span>
                      {item.shortcut ? <span className="titlebar-menu-shortcut">{item.shortcut}</span> : null}
                    </button>
                  )
                )}
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
