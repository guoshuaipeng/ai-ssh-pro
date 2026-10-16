import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { placeMenu, placeSubmenu } from '@shared/menu-place'
import type { BuiltItem, BuiltNode, BuiltSub } from '@shared/inline-menus'

type LabelNode = { label?: string; labelKey?: string; labelVars?: Record<string, string | number> }

type Props = {
  nodes: BuiltNode[]
  anchorX: number
  anchorY: number
  testId?: string
  variant: 'host' | 'tab'
  t: (key: string, vars?: Record<string, string | number>) => string
  onPick: (id: string) => void
}

function textOf(node: LabelNode, t: Props['t']): string {
  if (node.label) return node.label
  if (node.labelKey) return t(node.labelKey, node.labelVars)
  return ''
}

function assignRef(ref: Ref<HTMLDivElement> | undefined, value: HTMLDivElement | null): void {
  if (!ref) return
  if (typeof ref === 'function') ref(value)
  else (ref as { current: HTMLDivElement | null }).current = value
}

/**
 * One renderer for a built row menu. The menu is portaled and flipped with placeMenu
 * so a 1366 window does not grow the main pane. A submenu is a sibling of the scrollport,
 * not a child of it, so the scrolling menu cannot clip the flyout.
 */
export const BuiltMenu = forwardRef<HTMLDivElement, Props>(function BuiltMenu(
  { nodes, anchorX, anchorY, testId, variant, t, onPick },
  ref
) {
  const [pos, setPos] = useState({ x: anchorX, y: anchorY })
  const innerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const flyoutRef = useRef<HTMLDivElement>(null)
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>())
  const closeTimer = useRef<number | null>(null)
  const [openSubId, setOpenSubId] = useState<string | null>(null)
  const [flyoutPos, setFlyoutPos] = useState<{ x: number; y: number } | null>(null)
  const sig = nodes.map((node) => (node.type === 'sep' ? '|' : node.id)).join(',')
  const host = variant === 'host'
  const subs = nodes.filter((node): node is BuiltSub => node.type === 'sub')
  const openSub = subs.find((node) => node.id === openSubId) ?? null

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const next = placeMenu(anchorX, anchorY, rect.width, rect.height, window.innerWidth, window.innerHeight)
    setPos((prev) => (Math.abs(prev.x - next.x) <= 1 && Math.abs(prev.y - next.y) <= 1 ? prev : next))
  }, [anchorX, anchorY, sig])

  const clearClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  const placeOpenFlyout = useCallback(() => {
    const id = openSubId
    const trigger = id ? triggerRefs.current.get(id) : null
    const fly = flyoutRef.current
    if (!id || !trigger || !fly) return
    const rect = trigger.getBoundingClientRect()
    const next = placeSubmenu(
      { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
      fly.offsetWidth,
      fly.offsetHeight,
      window.innerWidth,
      window.innerHeight
    )
    setFlyoutPos((prev) => (prev && Math.abs(prev.x - next.x) <= 1 && Math.abs(prev.y - next.y) <= 1 ? prev : { x: next.x, y: next.y }))
  }, [openSubId])

  useLayoutEffect(() => {
    if (!openSubId) {
      setFlyoutPos(null)
      return
    }
    placeOpenFlyout()
  }, [openSubId, sig, placeOpenFlyout])

  useEffect(() => {
    if (!openSubId) return
    const scroll = scrollRef.current
    const onMove = () => placeOpenFlyout()
    scroll?.addEventListener('scroll', onMove)
    window.addEventListener('resize', onMove)
    return () => {
      scroll?.removeEventListener('scroll', onMove)
      window.removeEventListener('resize', onMove)
    }
  }, [openSubId, placeOpenFlyout])

  useEffect(() => () => clearClose(), [])

  const showSub = (id: string) => {
    clearClose()
    setOpenSubId(id)
  }

  const hideSubSoon = () => {
    clearClose()
    closeTimer.current = window.setTimeout(() => {
      const active = document.activeElement
      const trigger = openSubId ? triggerRefs.current.get(openSubId) : null
      const fly = flyoutRef.current
      const row = trigger?.closest('.session-context-submenu-wrap')
      if (active && (fly?.contains(active) || trigger === active)) return
      if (fly?.matches(':hover') || row?.matches(':hover')) return
      setOpenSubId(null)
    }, 140)
  }

  const itemClass = (node: BuiltItem) =>
    `${host ? 'session-context-menu-item' : ''}${node.danger ? ' danger' : ''}`

  const renderItem = (node: BuiltItem) => (
    <button
      key={node.id}
      type="button"
      role="menuitem"
      data-ctx={node.id}
      data-testid={node.testId}
      className={itemClass(node)}
      disabled={node.disabled}
      title={node.title ?? (node.titleKey ? t(node.titleKey) : undefined)}
      onMouseEnter={() => {
        if (openSubId) hideSubSoon()
      }}
      onClick={() => {
        if (node.disabled) return
        onPick(node.id)
      }}
    >
      <span>{textOf(node, t)}</span>
      {node.hint || node.hintKey ? (
        <span className={host ? 'session-context-menu-hint' : 'tab-menu-hint'}>
          {node.hint ?? (node.hintKey ? t(node.hintKey) : '')}
        </span>
      ) : null}
    </button>
  )

  const renderSubTrigger = (node: BuiltSub) => (
    <div
      key={node.id}
      className={`session-context-submenu-wrap${openSubId === node.id ? ' is-open' : ''}`}
      onMouseEnter={() => showSub(node.id)}
      onMouseLeave={hideSubSoon}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={openSubId === node.id}
        data-ctx={node.id}
        data-testid={`submenu-trigger-${node.id}`}
        className="session-context-menu-item session-context-menu-item--submenu"
        ref={(el) => {
          if (el) triggerRefs.current.set(node.id, el)
          else triggerRefs.current.delete(node.id)
        }}
        onFocus={() => showSub(node.id)}
        onBlur={(e) => {
          const next = e.relatedTarget
          if (next instanceof Node && flyoutRef.current?.contains(next)) return
          hideSubSoon()
        }}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          showSub(node.id)
          window.setTimeout(() => {
            flyoutRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
          }, 0)
        }}
      >
        <span>{textOf(node, t)}</span>
        <span className="session-context-menu-caret" aria-hidden>
          ›
        </span>
      </button>
    </div>
  )

  const renderFlyout = (node: BuiltSub) => {
    const rows = node.children.length
      ? node.children
      : [{ type: 'empty' as const, id: `${node.id}-empty`, labelKey: 'app.noFolders' }]
    return (
      <div
        ref={flyoutRef}
        className="session-context-submenu is-open"
        role="menu"
        data-testid={`submenu-${node.id}`}
        style={{
          left: flyoutPos?.x ?? 0,
          top: flyoutPos?.y ?? 0,
          right: 'auto',
          visibility: flyoutPos ? 'visible' : 'hidden'
        }}
        onMouseEnter={() => showSub(node.id)}
        onMouseLeave={hideSubSoon}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'Escape') return
          e.preventDefault()
          e.stopPropagation()
          setOpenSubId(null)
          triggerRefs.current.get(node.id)?.focus()
        }}
      >
        {rows.map((child) =>
          child.type === 'empty' ? (
            <button
              key={child.id}
              type="button"
              className="session-context-menu-item"
              disabled
              data-ctx={child.id}
              data-testid="submenu-empty"
            >
              {textOf(child, t)}
            </button>
          ) : (
            <button
              key={child.id}
              type="button"
              role="menuitem"
              data-ctx={child.id}
              className="session-context-menu-item"
              disabled={child.disabled}
              onClick={() => {
                if (child.disabled) return
                onPick(child.id)
              }}
            >
              {textOf(child, t)}
            </button>
          )
        )}
      </div>
    )
  }

  const body = nodes.map((node, index) => {
    if (node.type === 'sep') {
      return host ? <div key={`sep-${index}`} className="session-context-menu-sep" /> : <hr key={`sep-${index}`} />
    }
    if (node.type === 'sub') return renderSubTrigger(node)
    if (node.type === 'empty') return null
    return renderItem(node)
  })

  return createPortal(
    <div
      ref={(node) => {
        ;(innerRef as { current: HTMLDivElement | null }).current = node
        assignRef(ref, node)
      }}
      className={`${host ? 'session-context-menu' : 'tab-context-menu'}${host && subs.length ? ' has-flyout' : ''}`}
      role="menu"
      data-testid={testId}
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {host && subs.length ? (
        <div className="session-context-menu-scrollport" ref={scrollRef}>
          {body}
        </div>
      ) : (
        body
      )}
      {openSub ? renderFlyout(openSub) : null}
    </div>,
    document.body
  )
})
