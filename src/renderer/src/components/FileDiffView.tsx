import { useEffect, useMemo, useRef, useState } from 'react'
import { diffLines } from '../lib/simple-highlight'
import { pairSideBySide, toUnified } from '@shared/file-diff'
import { findDiffDraft, planDiffFix, type DiffFix } from '@shared/diff-fix'
import { loadPlaybooks } from '@shared/playbook'
import { useI18n } from '../lib/i18n'
import { showToast } from '../lib/toast'
import AiConfigCard from './AiConfigCard'
import { openContextMenu } from './ContextMenu'
import Icon from './Icon'

type Props = {
  leftName: string
  rightName: string
  leftText: string
  rightText: string
  tooLarge?: boolean
  onOpenRemote?: () => void
  onClose: () => void
  aiConfigured?: boolean
  hostKey?: string
  hostTitle?: string
  remotePath?: string
  onOpenSettings?: () => void
  onDraft?: (info: { hostKey: string; hostTitle: string; path: string; fixes: DiffFix[] }) => void
  onFocusDraft?: (id: string) => void
  /** Palette actions reach the visible diff only. */
  armed?: boolean
}

/** D5: read-only side-by-side or unified diff in a center tab. */
export default function FileDiffView({
  leftName,
  rightName,
  leftText,
  rightText,
  tooLarge,
  onOpenRemote,
  onClose,
  aiConfigured = false,
  hostKey = '',
  hostTitle = '',
  remotePath = '',
  onOpenSettings,
  onDraft,
  onFocusDraft,
  armed = false
}: Props) {
  const { t, locale } = useI18n()
  const [mode, setMode] = useState<'side' | 'unified'>('side')
  const [explain, setExplain] = useState('')
  const [fixes, setFixes] = useState<DiffFix[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [pulse, setPulse] = useState(false)
  const lines = useMemo(() => (tooLarge ? [] : diffLines(leftText, rightText)), [leftText, rightText, tooLarge])
  const rows = useMemo(() => pairSideBySide(lines), [lines])
  const unified = useMemo(() => (tooLarge ? '' : toUnified(lines, leftName, rightName)), [lines, leftName, rightName, tooLarge])
  const path = remotePath || rightName

  const needAi = () => {
    showToast(t('l8b.needAi'), { action: onOpenSettings ? { label: t('w1.configure'), run: onOpenSettings } : undefined })
  }

  const runExplain = async () => {
    if (!aiConfigured) {
      needAi()
      return
    }
    setBusy(true)
    try {
      const result = await window.aiss.ai.assist({
        requestId: `l8b-${Date.now()}`,
        kind: 'explainAlert',
        text: unified || `${leftName}\n${rightName}`,
        host: hostTitle,
        locale
      })
      if (!result.ok) {
        if (result.code === 'not-configured') needAi()
        return
      }
      if (result.kind !== 'explainAlert' && result.kind !== 'explainError') return
      setExplain(result.cause)
      setFixes(result.fixes ?? [])
      setPulse(true)
      window.setTimeout(() => setPulse(false), 2000)
    } finally {
      setBusy(false)
    }
  }

  const create = () => {
    const existing = hostKey ? findDiffDraft(loadPlaybooks(), hostKey, path) : undefined
    const plan = planDiffFix({
      aiConfigured,
      hasExplanation: Boolean(explain),
      fixes,
      existingDraftId: existing?.id,
      hostKey,
      hostTitle,
      path
    })
    if (plan.action === 'need-ai') {
      needAi()
      return
    }
    if (plan.action === 'focus' && plan.draftId) {
      onFocusDraft?.(plan.draftId)
      showToast(t('w1.openedExisting'))
      return
    }
    if (plan.action === 'explain-first') {
      void runExplain()
      return
    }
    if (plan.action === 'no-fixes') {
      showToast(t('l8b.noFixes'))
      return
    }
    if (plan.action === 'draft') onDraft?.({ hostKey, hostTitle, path, fixes: plan.fixes })
  }

  const explainRef = useRef(runExplain)
  const createRef = useRef(create)
  explainRef.current = runExplain
  createRef.current = create
  useEffect(() => {
    if (!armed) return
    const onExplain = () => {
      void explainRef.current()
    }
    const onCreate = () => {
      createRef.current()
    }
    window.addEventListener('aiss-diff-explain', onExplain)
    window.addEventListener('aiss-diff-create', onCreate)
    return () => {
      window.removeEventListener('aiss-diff-explain', onExplain)
      window.removeEventListener('aiss-diff-create', onCreate)
    }
  }, [armed])

  const menu = (e: { clientX: number; clientY: number; preventDefault?: () => void }) => {
    openContextMenu(e, [
      { id: 'l8b-explain', label: t('l8b.explain'), title: aiConfigured ? undefined : t('l8b.needAi'), onSelect: () => void runExplain() },
      { id: 'l8b-create', label: t('l8b.create'), title: aiConfigured ? undefined : t('l8b.needAi'), onSelect: create }
    ])
  }

  return (
    <div className="workspace-panel d5-diff" data-testid="file-diff">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">
          {t('d5.title')} · {leftName} <Icon name="arrow-left-right" size={12} /> {rightName}
        </h2>
        <div className="workspace-panel-actions l8b-actions">
          <button type="button" data-testid="l8b-explain" data-ai={aiConfigured ? '1' : '0'} title={aiConfigured ? t('l8b.explain') : t('l8b.needAi')} onClick={() => void runExplain()} disabled={tooLarge || busy}>
            <Icon name="sparkles" size={14} /> {t('l8b.explain')}
          </button>
          <button type="button" data-testid="l8b-create" className={pulse ? 'is-highlight' : ''} data-ai={aiConfigured ? '1' : '0'} title={aiConfigured ? t('l8b.create') : t('l8b.needAi')} onClick={create} disabled={tooLarge}>
            {t('l8b.create')}
          </button>
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
      <div className="workspace-panel-body d5-body" onContextMenu={menu}>
        {!aiConfigured ? <AiConfigCard context={t('l8b.needAi')} onConfigure={() => onOpenSettings?.()} /> : null}
        {explain ? (
          <aside className="l8b-panel" data-testid="l8b-panel">
            <strong>{t('l8b.panel')}</strong>
            <p>{explain}</p>
            <button type="button" onClick={create}>{t('l8b.create')}</button>
          </aside>
        ) : null}
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
