import { useEffect, useRef, useState } from 'react'
import type { AppDialogKind } from '@shared/ipc'

export type TitlebarMenuAction = AppDialogKind | 'quit' | 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'selectAll'

type MenuItem =
  | { type: 'item'; id: TitlebarMenuAction; label: string; shortcut?: string }
  | { type: 'sep' }

type MenuDef = { id: string; label: string; items: MenuItem[] }

const MENUS: MenuDef[] = [
  {
    id: 'session',
    label: '会话',
    items: [
      { type: 'item', id: 'connection', label: '新建连接', shortcut: 'Ctrl+Shift+N' },
      { type: 'item', id: 'localShell', label: '本机 Shell' },
      { type: 'item', id: 'sftp', label: '文件传输', shortcut: 'Ctrl+Shift+F' },
      { type: 'item', id: 'refreshDocker', label: '刷新 Docker', shortcut: 'Ctrl+Shift+D' },
      { type: 'sep' },
      { type: 'item', id: 'newFolder', label: '新建文件夹' },
      { type: 'item', id: 'importSessions', label: '导入会话…' },
      { type: 'item', id: 'exportOpenssh', label: '导出 OpenSSH…' },
      { type: 'item', id: 'exportJson', label: '导出 JSON…' },
      { type: 'sep' },
      { type: 'item', id: 'toggleSplit', label: '分屏' },
      { type: 'item', id: 'toggleBroadcast', label: '切换广播输入' },
      { type: 'item', id: 'toggleRecording', label: '开始/停止录制' },
      { type: 'sep' },
      { type: 'item', id: 'ai', label: 'AI 配置', shortcut: 'Ctrl+,' },
      { type: 'item', id: 'debug', label: 'AI 助手调试…' },
      { type: 'sep' },
      { type: 'item', id: 'snippets', label: '命令片段' },
      { type: 'item', id: 'inventory', label: '主机档案', shortcut: 'Ctrl+Shift+H' }
    ]
  },
  {
    id: 'edit',
    label: '编辑',
    items: [
      { type: 'item', id: 'undo', label: '撤销', shortcut: 'Ctrl+Z' },
      { type: 'item', id: 'redo', label: '重做', shortcut: 'Ctrl+Y' },
      { type: 'sep' },
      { type: 'item', id: 'cut', label: '剪切', shortcut: 'Ctrl+X' },
      { type: 'item', id: 'copy', label: '复制', shortcut: 'Ctrl+C' },
      { type: 'item', id: 'paste', label: '粘贴', shortcut: 'Ctrl+V' },
      { type: 'item', id: 'selectAll', label: '全选', shortcut: 'Ctrl+A' }
    ]
  },
  {
    id: 'view',
    label: '查看',
    items: [
      { type: 'item', id: 'toggleSidebar', label: '切换左侧会话栏', shortcut: 'Ctrl+B' },
      { type: 'item', id: 'toggleMain', label: '切换中间终端区' },
      { type: 'item', id: 'toggleAi', label: '切换右侧 AI 面板', shortcut: 'Ctrl+Alt+B' },
      { type: 'sep' },
      { type: 'item', id: 'uiTheme', label: '界面主题' },
      { type: 'item', id: 'terminalPrefs', label: '终端外观' }
    ]
  },
  {
    id: 'file',
    label: '文件',
    items: [{ type: 'item', id: 'quit', label: '退出', shortcut: 'Alt+F4' }]
  }
]

type Props = {
  onAction: (action: TitlebarMenuAction) => void
}

/** 标题栏内嵌菜单（替代被隐藏的系统菜单栏） */
export default function TitlebarMenus({ onAction }: Props) {
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
              {menu.label}
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
                      <span>{item.label}</span>
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
