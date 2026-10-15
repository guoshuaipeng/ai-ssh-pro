import { useEffect, useRef, useState } from 'react'
import { SHARED_MENUS, menuLabel, visibleMenuItems, type MenuAction } from '@shared/menus'
import { useI18n } from '../lib/i18n'
import Icon from './Icon'

export type TitlebarMenuAction = MenuAction

/** Single menu definition shared with the main process (UX-03). */
export const MENUS = SHARED_MENUS

type Props = {
  onAction: (action: TitlebarMenuAction) => void
  /** current on/off state of toggle items, shown with a check icon (UX-10) */
  toggles?: Partial<Record<MenuAction, boolean>>
  /** greyed items stay visible; the tooltip explains why they do not run */
  disabled?: Partial<Record<MenuAction, boolean>>
  hints?: Partial<Record<MenuAction, string | undefined>>
}

/** 标题栏内嵌菜单（替代被隐藏的系统菜单栏） */
export default function TitlebarMenus({ onAction, toggles, disabled, hints }: Props) {
  const { locale } = useI18n()
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
              {menuLabel(menu.label, locale)}
            </button>
            {open ? (
              <div className="titlebar-menu-dropdown" role="menu">
                {visibleMenuItems(menu).map((item, i) =>
                  item.type === 'sep' ? (
                    <div key={`sep-${menu.id}-${i}`} className="titlebar-menu-sep" />
                  ) : (
                    <button
                      key={item.id}
                      type="button"
                      className={`titlebar-menu-item${disabled?.[item.id] ? ' is-disabled' : ''}`}
                      role={item.toggle ? 'menuitemcheckbox' : 'menuitem'}
                      aria-checked={item.toggle ? Boolean(toggles?.[item.id]) : undefined}
                      aria-disabled={disabled?.[item.id] || undefined}
                      title={disabled?.[item.id] ? hints?.[item.id] : undefined}
                      data-action={item.id}
                      onClick={() => {
                        if (disabled?.[item.id]) return
                        setOpenId(null)
                        onAction(item.id)
                      }}
                    >
                      <span className="titlebar-menu-check" aria-hidden>
                        {item.toggle && toggles?.[item.id] ? <Icon name="check" size={14} /> : null}
                      </span>
                      <span className="titlebar-menu-label">{menuLabel(item.label, locale)}</span>
                      {item.shortcut ? <span className="titlebar-menu-shortcut">{item.shortcut}</span> : <span />}
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
