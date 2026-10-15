import { forwardRef, useLayoutEffect, useRef, useState, type Ref } from 'react'
import { createPortal } from 'react-dom'
import { placeMenu } from '@shared/menu-place'
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
 * so a 1366 window does not grow the main pane.
 */
export const BuiltMenu = forwardRef<HTMLDivElement, Props>(function BuiltMenu(
  { nodes, anchorX, anchorY, testId, variant, t, onPick },
  ref
) {
  const [pos, setPos] = useState({ x: anchorX, y: anchorY })
  const innerRef = useRef<HTMLDivElement>(null)
  const sig = nodes.map((node) => (node.type === 'sep' ? '|' : node.id)).join(',')

  useLayoutEffect(() => {
    const el = innerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const next = placeMenu(anchorX, anchorY, rect.width, rect.height, window.innerWidth, window.innerHeight)
    setPos((prev) => (Math.abs(prev.x - next.x) <= 1 && Math.abs(prev.y - next.y) <= 1 ? prev : next))
  }, [anchorX, anchorY, sig])

  const openLeft = anchorX > window.innerWidth - 320
  const host = variant === 'host'

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
      onClick={() => {
        if (node.disabled) return
        onPick(node.id)
      }}
    >
      <span>{textOf(node, t)}</span>
      {host && (node.hint || node.hintKey) ? (
        <span className="session-context-menu-hint">{node.hint ?? (node.hintKey ? t(node.hintKey) : '')}</span>
      ) : null}
    </button>
  )

  const renderSub = (node: BuiltSub) => (
    <div key={node.id} className={`session-context-submenu-wrap${openLeft ? ' open-left' : ''}`}>
      <button type="button" role="menuitem" data-ctx={node.id} className="session-context-menu-item session-context-menu-item--submenu">
        <span>{textOf(node, t)}</span>
        <span className="session-context-menu-caret" aria-hidden>
          ›
        </span>
      </button>
      <div className="session-context-submenu" role="menu">
        {node.children.map((child) =>
          child.type === 'empty' ? (
            <div key={child.id} className="session-context-submenu-empty">
              {textOf(child, t)}
            </div>
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
    </div>
  )

  return createPortal(
    <div
      ref={(node) => {
        ;(innerRef as { current: HTMLDivElement | null }).current = node
        assignRef(ref, node)
      }}
      className={host ? 'session-context-menu' : 'tab-context-menu'}
      role="menu"
      data-testid={testId}
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
    >
      {nodes.map((node, index) => {
        if (node.type === 'sep') {
          return host ? <div key={`sep-${index}`} className="session-context-menu-sep" /> : <hr key={`sep-${index}`} />
        }
        if (node.type === 'sub') return renderSub(node)
        if (node.type === 'empty') return null
        return renderItem(node)
      })}
    </div>,
    document.body
  )
})
