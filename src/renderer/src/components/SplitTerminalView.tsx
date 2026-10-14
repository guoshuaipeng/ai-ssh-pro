import { useState } from 'react'
import { tg } from '../lib/i18n'
import type { TerminalPrefs } from '@shared/ipc'
import TerminalPane from './TerminalPane'

type Props = {
  sessionId: string
  active: boolean
  prefs?: TerminalPrefs
  /** When true, both panes accept input and write to the same session */
  broadcastEnabled?: boolean
  /** Initial layout; user can toggle in the toolbar */
  defaultOrientation?: 'horizontal' | 'vertical'
}

/**
 * Same SSH session rendered in two panes.
 * - Both always mirror ssh:data
 * - When broadcastEnabled: either pane can type (both call ssh.write)
 * - When off: secondary pane is display-only (mirror)
 */
export default function SplitTerminalView({
  sessionId,
  active,
  prefs,
  broadcastEnabled = false,
  defaultOrientation = 'horizontal'
}: Props) {
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>(defaultOrientation)

  const flexDir = orientation === 'horizontal' ? 'row' : 'column'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '4px 8px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          fontSize: 12,
          color: 'var(--muted)'
        }}
      >
        <span>{tg('split.title')}</span>
        <button
          type="button"
          className="ai-fill-cmd-btn"
          onClick={() => setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
          title={tg('split.toggleTip')}
        >
          {orientation === 'horizontal' ? tg('split.horizontal') : tg('split.vertical')}
        </button>
        <span style={{ marginLeft: 'auto' }}>
          {broadcastEnabled ? tg('split.bcOn') : tg('split.bcOff')}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: flexDir,
          flex: 1,
          minHeight: 0,
          minWidth: 0
        }}
      >
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            borderRight: orientation === 'horizontal' ? '1px solid var(--border)' : undefined,
            borderBottom: orientation === 'vertical' ? '1px solid var(--border)' : undefined
          }}
        >
          <TerminalPane sessionId={sessionId} active={active} prefs={prefs} />
        </div>
        <div style={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <TerminalPane
            sessionId={sessionId}
            active={active}
            prefs={prefs}
            mirrorOnly={!broadcastEnabled}
          />
        </div>
      </div>
    </div>
  )
}
