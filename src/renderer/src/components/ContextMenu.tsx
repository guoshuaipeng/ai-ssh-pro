import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeMenu } from '@shared/menu-place'
import { Twist } from './Icon'
import { TREE_CHEVRON_SIZE } from './emptyIcons'

export type ContextMenuItem =
  | {
      id: string
      label: string
      icon?: ReactNode
      shortcut?: string
      disabled?: boolean
      danger?: boolean
      submenu?: ContextMenuItem[]
      onSelect?: () => void
      title?: string
    }
  | 'sep'

type Anchor = { x: number; y: number }

type OpenState = {
  items: ContextMenuItem[]
  anchor: Anchor
  resolve?: () => void
}

let openFn: ((s: OpenState | null) => void) | null = null

/** UX-22: open a unified context menu at the pointer (or given anchor). */
export function openContextMenu(
  e: { clientX: number; clientY: number; preventDefault?: () => void; stopPropagation?: () => void },
  items: ContextMenuItem[],
  opts?: { anchor?: Anchor }
): void {
  e.preventDefault?.()
  e.stopPropagation?.()
  openFn?.({
    items,
    anchor: opts?.anchor ?? { x: e.clientX, y: e.clientY }
  })
}

/** HK2: other app-owned menus (tab menu) listen for this to close together. */
export const CLOSE_MENUS_EVENT = 'aiss:close-menus'

export function closeContextMenu(): void {
  openFn?.(null)
  window.dispatchEvent(new Event(CLOSE_MENUS_EVENT))
}

function MenuList({
  items,
  onClose,
  submenu
}: {
  items: ContextMenuItem[]
  onClose: () => void
  submenu?: boolean
}) {
  return (
    <ul className={`ctx-menu${submenu ? ' ctx-menu--sub' : ''}`} role="menu">
      {items.map((it, i) => {
        if (it === 'sep') return <li key={`sep-${i}`} className="ctx-menu-sep" role="separator" />
        if (it.submenu?.length) {
          return (
            <li key={it.id} className={`ctx-menu-item has-sub${it.disabled ? ' is-disabled' : ''}`} role="none">
              <button type="button" role="menuitem" disabled={it.disabled} className={it.danger ? 'danger' : undefined}>
                {it.icon ? <span className="ctx-icon">{it.icon}</span> : null}
                <span className="ctx-label">{it.label}</span>
                <span className="ctx-sub-arrow"><Twist open={false} size={TREE_CHEVRON_SIZE} /></span>
              </button>
              <div className="ctx-submenu">
                <MenuList items={it.submenu} onClose={onClose} submenu />
              </div>
            </li>
          )
        }
        return (
          <li key={it.id} className={`ctx-menu-item${it.disabled ? ' is-disabled' : ''}`} role="none">
            <button
              type="button"
              role="menuitem"
              disabled={it.disabled}
              className={it.danger ? 'danger' : undefined}
              title={it.title}
              onClick={() => {
                if (it.disabled) return
                it.onSelect?.()
                onClose()
              }}
            >
              {it.icon ? <span className="ctx-icon">{it.icon}</span> : null}
              <span className="ctx-label">{it.label}</span>
              {it.shortcut ? <span className="ctx-shortcut">{it.shortcut}</span> : null}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/** Mount once near App root. */
export function ContextMenuHost() {
  const [state, setState] = useState<OpenState | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

  useEffect(() => {
    openFn = setState
    return () => {
      openFn = null
    }
  }, [])

  useLayoutEffect(() => {
    if (!state || !ref.current) return
    const el = ref.current
    const rect = el.getBoundingClientRect()
    const next = placeMenu(state.anchor.x, state.anchor.y, rect.width, rect.height, window.innerWidth, window.innerHeight)
    setPos({ left: next.x, top: next.y })
  }, [state])

  useEffect(() => {
    if (!state) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setState(null)
      }
    }
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setState(null)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown, true)
    }
  }, [state])

  if (!state) return null
  return createPortal(
    <div className="ctx-menu-root" ref={ref} style={{ left: pos.left, top: pos.top }} data-testid="context-menu">
      <MenuList items={state.items} onClose={() => setState(null)} />
    </div>,
    document.body
  )
}

/** Attach a standard text-field context menu (UX-22 §2.1). */
export function textFieldContextItems(el: HTMLInputElement | HTMLTextAreaElement, t: (k: string) => string): ContextMenuItem[] {
  const isPassword = el instanceof HTMLInputElement && el.type === 'password'
  const hasSel = (el.selectionEnd ?? 0) > (el.selectionStart ?? 0)
  const canUndo = true
  const items: ContextMenuItem[] = []
  if (!isPassword) {
    items.push(
      { id: 'undo', label: t('ctx.undo'), shortcut: 'Ctrl+Z', disabled: !canUndo, onSelect: () => document.execCommand('undo') },
      { id: 'redo', label: t('ctx.redo'), shortcut: 'Ctrl+Y', onSelect: () => document.execCommand('redo') },
      'sep',
      {
        id: 'cut',
        label: t('ctx.cut'),
        shortcut: 'Ctrl+X',
        disabled: !hasSel || el.readOnly,
        onSelect: () => document.execCommand('cut')
      },
      {
        id: 'copy',
        label: t('ctx.copy'),
        shortcut: 'Ctrl+C',
        disabled: !hasSel,
        onSelect: () => document.execCommand('copy')
      }
    )
  }
  items.push({
    id: 'paste',
    label: t('ctx.paste'),
    shortcut: 'Ctrl+V',
    disabled: el.readOnly,
    onSelect: () => {
      void navigator.clipboard.readText().then((txt) => {
        const start = el.selectionStart ?? el.value.length
        const end = el.selectionEnd ?? el.value.length
        const next = el.value.slice(0, start) + txt + el.value.slice(end)
        const proto = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
        proto?.set?.call(el, next)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        const caret = start + txt.length
        el.setSelectionRange(caret, caret)
      })
    }
  })
  items.push('sep', { id: 'selectAll', label: t('ctx.selectAll'), shortcut: 'Ctrl+A', onSelect: () => el.select() })
  return items
}
