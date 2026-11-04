import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { SHARED_MENUS, menuLabel, visibleMenuItems, type MenuAction, type SharedMenuItem } from '@shared/menus'
import { placeMenuDropdown } from '@shared/menu-fit'
import { useI18n } from '../lib/i18n'
import Icon from './Icon'
import { CHROME_ICON_SIZE, CHROME_ICON_STROKE } from './emptyIcons'

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

function MenuRows({
  items,
  locale,
  toggles,
  disabled,
  hints,
  onAction,
  onClose
}: {
  items: SharedMenuItem[]
  locale: string
  toggles?: Props['toggles']
  disabled?: Props['disabled']
  hints?: Props['hints']
  onAction: (action: MenuAction) => void
  onClose: () => void
}) {
  const [openSub, setOpenSub] = useState<string | null>(null)

  return (
    <>
      {items.map((item, i) => {
        if (item.type === 'sep') {
          return <div key={`sep-${i}`} className="titlebar-menu-sep" />
        }
        if (item.type === 'sub') {
          const open = openSub === item.id
          return (
            <div
              key={item.id}
              className={`titlebar-menu-sub${open ? ' is-open' : ''}`}
              onMouseEnter={() => setOpenSub(item.id)}
              onMouseLeave={() => setOpenSub((cur) => (cur === item.id ? null : cur))}
            >
              <button
                type="button"
                className="titlebar-menu-item titlebar-menu-item--sub"
                role="menuitem"
                aria-haspopup="true"
                aria-expanded={open}
                onClick={() => setOpenSub(open ? null : item.id)}
              >
                <span className="titlebar-menu-check" aria-hidden />
                <span className="titlebar-menu-label">{menuLabel(item.label, locale)}</span>
                <span className="titlebar-menu-shortcut">›</span>
              </button>
              {open ? (
                <div className="titlebar-menu-flyout" role="menu">
                  <MenuRows
                    items={item.items}
                    locale={locale}
                    toggles={toggles}
                    disabled={disabled}
                    hints={hints}
                    onAction={onAction}
                    onClose={onClose}
                  />
                </div>
              ) : null}
            </div>
          )
        }
        return (
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
              onClose()
              onAction(item.id)
            }}
          >
            <span className="titlebar-menu-check" aria-hidden>
              {item.toggle && toggles?.[item.id] ? (
                <Icon name="check" size={CHROME_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
              ) : null}
            </span>
            <span className="titlebar-menu-label">{menuLabel(item.label, locale)}</span>
            {item.shortcut ? <span className="titlebar-menu-shortcut">{item.shortcut}</span> : <span />}
          </button>
        )
      })}
    </>
  )
}

/** 标题栏内嵌菜单（替代被隐藏的系统菜单栏） */
export default function TitlebarMenus({ onAction, toggles, disabled, hints }: Props) {
  const { locale } = useI18n()
  const [openId, setOpenId] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const el = dropRef.current
    if (!openId || !el) return
    const anchor = el.parentElement?.getBoundingClientRect()
    if (!anchor) return
    const placed = placeMenuDropdown({
      anchorTop: anchor.top,
      anchorBottom: anchor.bottom + 4,
      anchorLeft: anchor.left,
      menuWidth: Math.max(el.offsetWidth, 220),
      menuHeight: el.scrollHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight
    })
    el.style.maxHeight = `${placed.maxHeight}px`
    el.style.overflowY = 'auto'
    if (placed.openUp) {
      el.style.top = 'auto'
      el.style.bottom = 'calc(100% + 4px)'
    } else {
      el.style.top = 'calc(100% + 4px)'
      el.style.bottom = 'auto'
    }
    el.style.left = `${placed.left - anchor.left}px`
  }, [openId, locale])

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
              <div className="titlebar-menu-dropdown" role="menu" ref={dropRef}>
                <MenuRows
                  items={visibleMenuItems(menu)}
                  locale={locale}
                  toggles={toggles}
                  disabled={disabled}
                  hints={hints}
                  onAction={onAction}
                  onClose={() => setOpenId(null)}
                />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
