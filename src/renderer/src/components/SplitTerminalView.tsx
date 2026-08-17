import { useState } from 'react'
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
        <span>分屏终端</span>
        <button
          type="button"
          className="ai-fill-cmd-btn"
          onClick={() => setOrientation((o) => (o === 'horizontal' ? 'vertical' : 'horizontal'))}
          title="切换左右 / 上下布局"
        >
          {orientation === 'horizontal' ? '左右' : '上下'}
        </button>
        <span style={{ marginLeft: 'auto' }}>
          {broadcastEnabled ? '广播输入：开（两侧均可键入）' : '广播输入：关（仅主屏可键入）'}
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
