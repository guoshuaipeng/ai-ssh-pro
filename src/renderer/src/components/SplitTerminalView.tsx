import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { tg } from '../lib/i18n'
import type { TerminalPrefs } from '@shared/ipc'
import TerminalPane from './TerminalPane'

type Peer = { sessionId: string; title: string }

type Props = {
  sessionId: string
  active: boolean
  prefs?: TerminalPrefs
  /** When true, both panes accept input and write to the same session */
  broadcastEnabled?: boolean
  /** Initial layout; user can toggle in the toolbar */
  defaultOrientation?: 'horizontal' | 'vertical'
  /** Other connected sessions that can be shown in the second pane */
  peers?: Peer[]
  /** UX-10: tells the app which session the second pane shows ('' = mirror of the primary) */
  onSecondaryChange?: (sessionId: string) => void
  hostKey?: string
  inputBlocked?: boolean
  onInputBlocked?: () => void
}

const LS_RATIO = 'aiss.split.ratio'
const LS_ORIENT = 'aiss.split.orientation'
const clampRatio = (r: number) => Math.min(0.85, Math.max(0.15, r))

function readRatio(): number {
  const v = Number(localStorage.getItem(LS_RATIO))
  return Number.isFinite(v) && v > 0 ? clampRatio(v) : 0.5
}

/**
 * Split view.
 * - Second pane mirrors the same session (display-only unless broadcast), or shows another
 *   connected session with full input.
 * - Draggable divider (double-click resets to 50/50); swap panes; orientation and ratio are remembered.
 */
export default function SplitTerminalView({
  sessionId,
  active,
  prefs,
  broadcastEnabled = false,
  defaultOrientation = 'horizontal',
  peers = [],
  onSecondaryChange,
  hostKey,
  inputBlocked,
  onInputBlocked
}: Props) {
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(() => {
    const v = localStorage.getItem(LS_ORIENT)
    return v === 'horizontal' || v === 'vertical' ? v : defaultOrientation
  })
  const [ratio, setRatio] = useState(readRatio)
  const [secondary, setSecondary] = useState('')
  const [swapped, setSwapped] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  useEffect(() => onSecondaryChange?.(secondary), [secondary, onSecondaryChange])
  useEffect(() => localStorage.setItem(LS_ORIENT, orientation), [orientation])
  useEffect(() => localStorage.setItem(LS_RATIO, String(ratio)), [ratio])
  useEffect(() => {
    if (secondary && !peers.some((p) => p.sessionId === secondary)) {
      setSecondary('')
      setSwapped(false)
    }
  }, [peers, secondary])

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!dragging.current || !boxRef.current) return
      const r = boxRef.current.getBoundingClientRect()
      const next = orientation === 'horizontal' ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height
      setRatio(clampRatio(next))
    },
    [orientation]
  )
  const stopDrag = useCallback(() => {
    dragging.current = false
    document.body.classList.remove('split-resizing')
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', stopDrag)
  }, [onPointerMove])
  const startDrag = (e: ReactPointerEvent) => {
    e.preventDefault()
    dragging.current = true
    document.body.classList.add('split-resizing')
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', stopDrag)
  }
  useEffect(() => stopDrag, [stopDrag])

  const horizontal = orientation === 'horizontal'
  const first = { id: sessionId, mirror: false }
  const second = secondary ? { id: secondary, mirror: false } : { id: sessionId, mirror: !broadcastEnabled }
  const [a, b] = swapped && secondary ? [second, first] : [first, second]

  return (
    <div className="split-view" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      <div className="split-toolbar">
        <span>{tg('split.title')}</span>
        <button
          type="button"
          className="ai-fill-cmd-btn"
          onClick={() => setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
          title={tg('split.toggleTip')}
        >
          {horizontal ? tg('split.horizontal') : tg('split.vertical')}
        </button>
        <label className="split-second">
          {tg('split.second')}{' '}
          <select aria-label={tg('split.second')} value={secondary} onChange={(e) => setSecondary(e.target.value)}>
            <option value="">{tg('split.mirror')}</option>
            {peers.map((p) => (
              <option key={p.sessionId} value={p.sessionId}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="ai-fill-cmd-btn" disabled={!secondary} onClick={() => setSwapped((s) => !s)}>
          {tg('split.swap')}
        </button>
        <button type="button" className="ai-fill-cmd-btn" onClick={() => setRatio(0.5)}>
          {tg('split.reset')}
        </button>
        <span style={{ marginLeft: 'auto' }}>{broadcastEnabled ? tg('split.bcOn') : tg('split.bcOff')}</span>
      </div>
      <div
        ref={boxRef}
        className={`split-body split-${orientation}`}
        style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', flex: 1, minHeight: 0, minWidth: 0 }}
      >
        <div className="split-pane" data-session-id={a.id} style={{ flex: `0 0 ${ratio * 100}%`, minWidth: 0, minHeight: 0 }}>
          <TerminalPane key={`a-${a.id}-${a.mirror}`} sessionId={a.id} active={active} prefs={prefs} mirrorOnly={a.mirror} hostKey={hostKey} inputBlocked={inputBlocked} onInputBlocked={onInputBlocked} />
        </div>
        <div
          className="split-divider"
          role="separator"
          aria-orientation={horizontal ? 'vertical' : 'horizontal'}
          aria-valuenow={Math.round(ratio * 100)}
          title={tg('split.dragTip')}
          onPointerDown={startDrag}
          onDoubleClick={() => setRatio(0.5)}
        />
        <div className="split-pane" data-session-id={b.id} style={{ flex: '1 1 0', minWidth: 0, minHeight: 0 }}>
          <TerminalPane key={`b-${b.id}-${b.mirror}`} sessionId={b.id} active={active} prefs={prefs} mirrorOnly={b.mirror} hostKey={hostKey} />
        </div>
      </div>
    </div>
  )
}
