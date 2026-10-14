import { useMemo, useState } from 'react'
import { diffLines } from '../lib/simple-highlight'
import { pairSideBySide, toUnified } from '@shared/file-diff'
import { useI18n } from '../lib/i18n'

type Props = {
  leftName: string
  rightName: string
  leftText: string
  rightText: string
  tooLarge?: boolean
  onOpenRemote?: () => void
  onClose: () => void
}

/** D5: read-only side-by-side or unified diff in a center tab. */
export default function FileDiffView({ leftName, rightName, leftText, rightText, tooLarge, onOpenRemote, onClose }: Props) {
  const { t } = useI18n()
  const [mode, setMode] = useState<'side' | 'unified'>('side')
  const lines = useMemo(() => (tooLarge ? [] : diffLines(leftText, rightText)), [leftText, rightText, tooLarge])
  const rows = useMemo(() => pairSideBySide(lines), [lines])
  const unified = useMemo(() => (tooLarge ? '' : toUnified(lines, leftName, rightName)), [lines, leftName, rightName, tooLarge])

  return (
    <div className="workspace-panel d5-diff" data-testid="file-diff">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">
          {t('d5.title')} · {leftName} ↔ {rightName}
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" className={mode === 'side' ? 'is-on' : ''} onClick={() => setMode('side')} disabled={tooLarge}>
            {t('d5.side')}
          </button>
          <button type="button" className={mode === 'unified' ? 'is-on' : ''} onClick={() => setMode('unified')} disabled={tooLarge}>
            {t('d5.unified')}
          </button>
          {onOpenRemote ? (
            <button type="button" onClick={onOpenRemote}>
              {t('d5.openEditor')}
            </button>
          ) : null}
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
      <div className="workspace-panel-body d5-body">
        {tooLarge ? (
          <p className="d5-large" data-testid="file-diff-large">
            {t('d5.tooLarge')}
          </p>
        ) : mode === 'unified' ? (
          <pre className="d5-unified">{unified}</pre>
        ) : (
          <div className="d5-side" data-testid="file-diff-side">
            <div className="d5-colhead">
              <span>{t('d5.local')} · {leftName}</span>
              <span>{t('d5.remote')} · {rightName}</span>
            </div>
            {rows.map((row, i) => (
              <div key={i} className="d5-row">
                <pre className={`d5-cell is-${row.left.kind}`}>{row.left.line ? `${row.left.line}  ` : '   '}{row.left.text}</pre>
                <pre className={`d5-cell is-${row.right.kind}`}>{row.right.line ? `${row.right.line}  ` : '   '}{row.right.text}</pre>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
