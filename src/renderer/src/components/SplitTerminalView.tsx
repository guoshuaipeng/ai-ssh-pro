import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { tg } from '../lib/i18n'
import type { TerminalPrefs } from '@shared/ipc'
import { reduceSplitFocus, splitPaneClass, splitSideCurrent, type SplitSide } from '@shared/split-focus'
import TerminalPane from './TerminalPane'
import Icon from './Icon'
import Select from './ui/Select'

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
  /** Title of the primary session, shown on its split tab strip. */
  primaryTitle?: string
  /** UX-10: tells the app which session the second pane shows ('' = mirror of the primary) */
  onSecondaryChange?: (sessionId: string) => void
  hostKey?: string
  inputBlocked?: boolean
  onInputBlocked?: () => void
  onGateInput?: (sessionId: string, data: string) => void
  onOpenSftp?: (sessionId: string) => void
  /** S41: broadcast pill on the strip (App decides: opens the target picker or turns it off). */
  onToggleBroadcast?: () => void
  /** S41: × on the strip; App runs the same toggleSplit path as the tab-bar button (live ref). */
  onCloseSplit?: () => void
}

const LS_RATIO = 'aiss.split.ratio'
const LS_ORIENT = 'aiss.split.orientation'
const clampRatio = (r: number) => Math.min(0.85, Math.max(0.15, r))

function readRatio(): number {
  const v = Number(localStorage.getItem(LS_RATIO))
  return Number.isFinite(v) && v > 0 ? clampRatio(v) : 0.5
}

type PaneModel = { id: string; mirror: boolean }

type SlotProps = {
  side: SplitSide
  focused: SplitSide
  title: string
  pane: PaneModel
  /** S41: 'primary' = the tab's own session; 'secondary' = mirror or another session */
  role: 'primary' | 'secondary'
  flex: string
  active: boolean
  prefs?: TerminalPrefs
  hostKey?: string
  inputBlocked?: boolean
  onInputBlocked?: () => void
  onOpenSftp?: (sessionId: string) => void
  onGateInput?: (sessionId: string, data: string) => void
  gate: boolean
  onFocusSide: (side: SplitSide) => void
  /** Strip content after the role badge (title or session Select). */
  label: ReactNode
  /** Strip controls on the right (only the first slot carries the shared ones). */
  controls?: ReactNode
}

/** IX-6: the pane owns the pointer, so a click on the tab strip or the content focuses this side. */
function SplitPaneSlot({
  side,
  focused,
  title,
  pane,
  role,
  flex,
  active,
  prefs,
  hostKey,
  inputBlocked,
  onInputBlocked,
  onOpenSftp,
  onGateInput,
  gate,
  onFocusSide,
  label,
  controls
}: SlotProps) {
  const current = splitSideCurrent(side, focused)
  return (
    <div
      className={splitPaneClass(side, focused)}
      data-split-side={side}
      data-split-role={role}
      data-testid={`split-pane-${side}`}
      data-session-id={pane.id}
      aria-current={current}
      style={{ flex, minWidth: 0, minHeight: 0 }}
      onMouseDownCapture={(e) => {
        onFocusSide(side)
        const target = e.target
        // S41: strip controls keep their own focus; only the bare strip hands focus to the terminal
        if (target instanceof Element && target.closest('.split-pane-tab') && !target.closest('button, .split-pane-ctl')) {
          const area = e.currentTarget.querySelector('.xterm-helper-textarea')
          if (area instanceof HTMLElement) area.focus()
        }
      }}
      onFocusCapture={() => onFocusSide(side)}
    >
      <div className="split-pane-tab" data-testid={`split-tab-${side}`} aria-current={current} title={title}>
        <span className={`split-role split-role--${role}`} data-testid={`split-role-${side}`}>
          {tg(role === 'primary' ? 's41.primary' : 's41.secondary')}
        </span>
        {label}
        {current ? <span className="split-focus-dot" aria-hidden title={tg('s41.focused')} /> : null}
        {controls ? <div className="split-pane-ctl">{controls}</div> : null}
      </div>
      <div className="split-pane-body">
        <TerminalPane
          key={`${side}-${pane.id}-${pane.mirror}`}
          sessionId={pane.id}
          active={active}
          prefs={prefs}
          mirrorOnly={pane.mirror}
          hostKey={hostKey}
          inputBlocked={inputBlocked}
          onInputBlocked={onInputBlocked}
          onOpenSftp={onOpenSftp}
          onUserData={gate && onGateInput ? (data) => onGateInput(pane.id, data) : undefined}
        />
      </div>
    </div>
  )
}

/** S41: square icon button; a disabled one still explains itself (title on a wrapper span). */
function StripBtn({ label, tip, disabled, onClick, testId, children }: { label: string; tip: string; disabled?: boolean; onClick: () => void; testId: string; children: ReactNode }) {
  const btn = (
    <button type="button" className="split-icon-btn" aria-label={label} title={tip} disabled={disabled} onClick={onClick} data-testid={testId}>
      {children}
    </button>
  )
  return disabled ? <span className="split-icon-wrap" title={tip}>{btn}</span> : btn
}
/**
 * Split view.
 * - Second pane mirrors the same session (display-only unless broadcast), or shows another
 *   connected session with full input.
 * - Draggable divider (double-click resets to 50/50); swap panes; orientation and ratio are remembered.
 * - IX-6: the focused side shows a 2px accent on its tab strip and aria-current. Clicking content switches focus.
 */
export default function SplitTerminalView({
  sessionId,
  active,
  prefs,
  broadcastEnabled = false,
  defaultOrientation = 'horizontal',
  peers = [],
  primaryTitle,
  onSecondaryChange,
  hostKey,
  inputBlocked,
  onInputBlocked,
  onGateInput,
  onOpenSftp,
  onToggleBroadcast,
  onCloseSplit
}: Props) {
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(() => {
    const v = localStorage.getItem(LS_ORIENT)
    return v === 'horizontal' || v === 'vertical' ? v : defaultOrientation
  })
  const [ratio, setRatio] = useState(readRatio)
  const [secondary, setSecondary] = useState('')
  const [swapped, setSwapped] = useState(false)
  const [focused, setFocused] = useState<SplitSide>('left')
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

  const onFocusSide = (side: SplitSide) => {
    setFocused((cur) => reduceSplitFocus(cur, side))
  }

  const horizontal = orientation === 'horizontal'
  const first = { id: sessionId, mirror: false }
  const second = secondary ? { id: secondary, mirror: false } : { id: sessionId, mirror: !broadcastEnabled }
  const [a, b] = swapped && secondary ? [second, first] : [first, second]
  const titleOf = (pane: PaneModel): string => {
    if (pane.id === sessionId) return primaryTitle?.trim() || tg('split.title')
    return peers.find((p) => p.sessionId === pane.id)?.title || pane.id
  }

  const secondIsA = swapped && Boolean(secondary)
  const secondOptions = [
    { value: '', label: tg('split.mirror'), hint: tg('s41.mirrorHint') },
    ...peers.map((p) => ({ value: p.sessionId, label: p.title }))
  ]
  const sessionSelect = (
    <Select
      value={secondary}
      options={secondOptions}
      onChange={(v) => {
        setSecondary(v)
        if (!v) setSwapped(false)
      }}
      ariaLabel={tg('split.second')}
      testId="split-second"
      className="split-pane-select split-pane-ctl"
    />
  )
  const primaryLabel = <span className="split-pane-tab-title">{titleOf(first)}</span>
  const swapTip = secondary ? tg('s41.swap') : tg('s41.swapDisabled')
  const sharedControls = (
    <>
      <button
        type="button"
        className={`split-bc-pill${broadcastEnabled ? ' is-on' : ''}`}
        role="switch"
        aria-checked={broadcastEnabled}
        data-testid="split-broadcast"
        title={tg(broadcastEnabled ? 's41.bcTipOn' : 's41.bcTipOff')}
        onClick={() => onToggleBroadcast?.()}
        disabled={!onToggleBroadcast}
      >
        <span className="split-bc-dot" aria-hidden />
        {tg(broadcastEnabled ? 's41.bcOn' : 's41.bcOff')}
      </button>
      <StripBtn
        testId="split-orient"
        label={tg('split.toggleTip')}
        tip={tg(horizontal ? 's41.orientH' : 's41.orientV')}
        onClick={() => setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
      >
        {horizontal ? (
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" /><path d="M8 2.5v11" stroke="currentColor" strokeWidth="1.35" /></svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.35" /><path d="M1.5 8h13" stroke="currentColor" strokeWidth="1.35" /></svg>
        )}
      </StripBtn>
      <StripBtn testId="split-swap" label={tg('s41.swap')} tip={swapTip} disabled={!secondary} onClick={() => setSwapped((v) => !v)}>
        <Icon name="arrow-left-right" size={14} />
      </StripBtn>
      <StripBtn testId="split-equal" label={tg('s41.equal')} tip={tg('s41.equal')} disabled={ratio === 0.5} onClick={() => setRatio(0.5)}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><path d="M3 5.5h10M3 10.5h10" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" /></svg>
      </StripBtn>
      {onCloseSplit ? (
        <StripBtn testId="split-close" label={tg('s41.close')} tip={tg('s41.close')} onClick={onCloseSplit}>
          <Icon name="x" size={14} />
        </StripBtn>
      ) : null}
    </>
  )

  return (
    <div
      className={`split-view${broadcastEnabled ? ' is-broadcast' : ''}`}
      data-testid="split-view"
      style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}
    >
      <div
        ref={boxRef}
        className={`split-body split-${orientation}`}
        style={{ display: 'flex', flexDirection: horizontal ? 'row' : 'column', flex: 1, minHeight: 0, minWidth: 0 }}
      >
        <SplitPaneSlot
          side="left"
          focused={focused}
          title={titleOf(a)}
          pane={a}
          role={secondIsA ? 'secondary' : 'primary'}
          label={secondIsA ? sessionSelect : primaryLabel}
          controls={sharedControls}
          flex={`0 0 ${ratio * 100}%`}
          active={active}
          prefs={prefs}
          hostKey={hostKey}
          inputBlocked={inputBlocked}
          onInputBlocked={onInputBlocked}
          onOpenSftp={onOpenSftp}
          onGateInput={onGateInput}
          gate
          onFocusSide={onFocusSide}
        />
        <div
          className="split-divider"
          role="separator"
          aria-orientation={horizontal ? 'vertical' : 'horizontal'}
          aria-valuenow={Math.round(ratio * 100)}
          title={tg('split.dragTip')}
          onPointerDown={startDrag}
          onDoubleClick={() => setRatio(0.5)}
        />
        <SplitPaneSlot
          side="right"
          focused={focused}
          title={titleOf(b)}
          pane={b}
          role={secondIsA ? 'primary' : 'secondary'}
          label={secondIsA ? primaryLabel : sessionSelect}
          flex="1 1 0"
          active={active}
          prefs={prefs}
          hostKey={hostKey}
          onOpenSftp={onOpenSftp}
          onGateInput={onGateInput}
          gate={!b.mirror}
          onFocusSide={onFocusSide}
        />
      </div>
    </div>
  )
}