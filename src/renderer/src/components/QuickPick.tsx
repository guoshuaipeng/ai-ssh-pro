import { useEffect, useMemo, useRef, useState } from 'react'
import { useOverlayFocusRestore } from '../lib/focus-restore'
import { highlightRuns, type PickItem } from '@shared/quick-pick'
import { tg } from '../lib/i18n'
import EmptyState from './EmptyState'
import Icon from './Icon'
import { EMPTY_ICON_SIZE_COMPACT, EMPTY_ICON_STROKE } from './emptyIcons'

type Props = {
  open: boolean
  testId: string
  title: string
  placeholder: string
  footer: string
  emptyTitle: string
  emptyDesc: string
  rank: (query: string) => PickItem[]
  onPick: (item: PickItem, opts?: { run?: boolean }) => void
  onClose: () => void
  /** D22b: ask AI about a failed history item */
  onAskFailed?: (item: PickItem) => void
  /** D31: fill `cd <dir> && cmd` for a history item that last ran elsewhere */
  onRunInCwd?: (item: PickItem) => void
  /** D31: current session cwd (hides the action when it already matches) */
  currentCwd?: string | null
  /** Pressing the opening chord again (e.g. Ctrl+R) closes and hands the key to the shell. */
  chord?: string
  onChord?: () => void
  /** D38: optional scope switch shown next to the input (Alt+H toggles) */
  scopeToggle?: { on: boolean; label: string; title: string; onToggle: () => void }
}

const BADGE_KEY: Record<NonNullable<PickItem['badge']>, Parameters<typeof tg>[0]> = {
  host: 'qp.badgeHost',
  common: 'qp.badgeCommon',
  snippet: 'qp.badgeSnippet',
  connected: 'qp.badgeConnected',
  disconnected: 'qp.badgeDisconnected',
  current: 'qp.badgeCurrent'
}

/** D3 / D4: themed fuzzy picker (reuses the command palette chrome). */
export default function QuickPick({ open, testId, title, placeholder, footer, emptyTitle, emptyDesc, rank, onPick, onClose, onAskFailed, onRunInCwd, currentCwd, chord, onChord, scopeToggle }: Props) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  useOverlayFocusRestore(open)
  useEffect(() => {
    if (!open) return
    setQ('')
    setSel(0)
    window.setTimeout(() => inputRef.current?.focus(), 0)
  }, [open])
  const items = useMemo(() => (open ? rank(q) : []), [open, q, rank])
  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])
  if (!open) return null
  const pick = (it: PickItem | undefined, opts?: { run?: boolean }) => {
    if (!it) return
    onClose()
    window.setTimeout(() => onPick(it, opts), 0)
  }
  return (
    <div className="cmdp-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="cmdp qp" role="dialog" aria-label={title} data-testid={testId} onMouseDown={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="cmdp-input"
          placeholder={placeholder}
          aria-label={title}
          role="combobox"
          aria-expanded="true"
          aria-controls={`${testId}-list`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (chord && e.ctrlKey && !e.shiftKey && !e.altKey && e.key.toLowerCase() === chord) {
              e.preventDefault()
              e.stopPropagation()
              onClose()
              onChord?.()
              return
            }
            if (scopeToggle && e.altKey && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'h') {
              e.preventDefault()
              scopeToggle.onToggle()
              return
            }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              if (!items.length) return
              const d = e.key === 'ArrowDown' ? 1 : -1
              setSel((s) => (s + d + items.length) % items.length)
            } else if (e.key === 'Enter') {
              e.preventDefault()
              // D33: Ctrl+Enter runs (the caller decides whether that is allowed)
              pick(items[sel], e.ctrlKey || e.metaKey ? { run: true } : undefined)
            } else if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              onClose()
            }
          }}
        />
        {scopeToggle ? (
          <div className="qp-scope">
            <button
              type="button"
              className={`qp-scope-btn${scopeToggle.on ? ' is-on' : ''}`}
              data-testid="qp-host-only"
              aria-pressed={scopeToggle.on}
              title={scopeToggle.title}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                scopeToggle.onToggle()
                inputRef.current?.focus()
              }}
            >
              {scopeToggle.label}
            </button>
          </div>
        ) : null}
        <div className="cmdp-list" role="listbox" id={`${testId}-list`} ref={listRef}>
          {items.length === 0 ? (
            <EmptyState
              compact
              testId={`${testId}-empty`}
              icon={<Icon name="search" size={EMPTY_ICON_SIZE_COMPACT} strokeWidth={EMPTY_ICON_STROKE} />}
              title={emptyTitle}
              desc={emptyDesc}
            />
          ) : null}
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="option"
              aria-selected={i === sel}
              className={`cmdp-item qp-item${i === sel ? ' is-active' : ''}`}
              data-kind={it.kind}
              onMouseEnter={() => setSel(i)}
              onClick={() => pick(it)}
            >
              <span className={`cmdp-label${it.kind === 'history' || it.kind === 'snippet' ? ' qp-mono' : ''}`}>
                {highlightRuns(it.label, it.indices).map((r, k) => (r.hit ? <mark key={k} className="qp-hit">{r.text}</mark> : <span key={k}>{r.text}</span>))}
              </span>
              {it.detail ? <span className="cmdp-group qp-detail">{it.detail}</span> : it.cwd ? <span className="cmdp-group qp-detail qp-cwd" data-testid="qp-cwd" title={tg('d31.cwdTip', { dir: it.cwd })}>{it.cwd}</span> : null}
              {it.cwd && onRunInCwd && it.cwd !== currentCwd ? (
                <span
                  role="button"
                  tabIndex={-1}
                  className="qp-badge qp-ask-failed"
                  data-testid="qp-run-in-cwd"
                  title={tg('d31.runTip', { dir: it.cwd })}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                    window.setTimeout(() => onRunInCwd(it), 0)
                  }}
                >
                  {tg('d31.run')}
                </span>
              ) : null}
              {typeof it.failed === 'number' ? <span className="qp-badge qp-badge--failed" data-testid="qp-failed" title={tg('d22.failedTip', { code: it.failed })}>{tg('d22.failed', { code: it.failed })}</span> : null}
              {typeof it.failed === 'number' && onAskFailed ? (
                <span
                  role="button"
                  tabIndex={-1}
                  className="qp-badge qp-ask-failed"
                  data-testid="qp-ask-failed"
                  title={tg('d22b.askTip')}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose()
                    window.setTimeout(() => onAskFailed(it), 0)
                  }}
                >
                  {tg('d22b.ask')}
                </span>
              ) : null}
              {it.badge ? <span className={`qp-badge qp-badge--${it.badge}`}>{tg(BADGE_KEY[it.badge])}</span> : null}
            </button>
          ))}
        </div>
        <div className="cmdp-foot">{footer}</div>
      </div>
    </div>
  )
}
