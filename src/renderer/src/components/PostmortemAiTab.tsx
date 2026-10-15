import { useEffect, useRef, useState } from 'react'
import type { TimelineAlert, TimelineEvent } from '@shared/timeline'
import {
  commandActions,
  draftDirty,
  draftFromAssist,
  draftFromTimeline,
  exportPostmortemMarkdown,
  planPostmortem,
  postmortemPrompt,
  type PostmortemDraft
} from '@shared/postmortem-ai'
import { confirmDialog } from '../lib/dialogs'
import { useI18n } from '../lib/i18n'
import { showToast } from '../lib/toast'
import AiConfigCard from './AiConfigCard'
import Icon from './Icon'

type Props = {
  alert: TimelineAlert
  events: TimelineEvent[]
  aiConfigured: boolean
  onOpenSettings: () => void
  onOpenTimeline?: () => void
}

/** A5 center tab. Suggested commands copy only. */
export default function PostmortemAiTab({ alert, events, aiConfigured, onOpenSettings, onOpenTimeline }: Props) {
  const { t, locale } = useI18n()
  const plan = planPostmortem(aiConfigured, events)
  const seed = draftFromTimeline(events)
  const [phase, setPhase] = useState<'idle' | 'loading' | 'ready' | 'error'>(plan === 'generate' ? 'loading' : 'idle')
  const [draft, setDraft] = useState<PostmortemDraft>(seed)
  const [saved, setSaved] = useState<PostmortemDraft>(seed)
  const [error, setError] = useState('')
  const dirty = draftDirty(draft, saved)
  const actions = commandActions(draft)

  const generate = async () => {
    if (!aiConfigured) return
    setPhase('loading')
    setError('')
    const requestId = `a5-${alert.id}-${Date.now()}`
    try {
      const result = await window.aiss.ai.assist({
        requestId,
        kind: 'explainAlert',
        text: postmortemPrompt({ title: `${alert.hostTitle} ${alert.ruleId}`, ruleId: alert.ruleId, host: alert.hostTitle, events }),
        host: alert.hostTitle,
        locale
      })
      if (!result.ok) {
        if (result.code === 'not-configured') {
          setPhase('idle')
          return
        }
        setPhase('error')
        setError(result.code === 'aborted' ? '' : result.message || result.code)
        return
      }
      if (result.kind !== 'explainAlert' && result.kind !== 'explainError') {
        setPhase('error')
        setError('shape')
        return
      }
      const next = draftFromAssist(events, result)
      setDraft(next)
      setSaved(next)
      setPhase('ready')
    } catch (e) {
      setPhase('error')
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const started = useRef(false)
  useEffect(() => {
    if (started.current || plan !== 'generate') return
    started.current = true
    void generate()
    // One shot when the tab opens with a timeline.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  const regen = async () => {
    if (dirty) {
      const ok = await confirmDialog({ title: t('a5.regenTitle'), body: t('a5.regenBody'), confirmText: t('a5.regen') })
      if (!ok) return
    }
    await generate()
  }

  const save = async () => {
    const lang = locale === 'en' ? 'en' : 'zh'
    const markdown = exportPostmortemMarkdown(draft, lang)
    const name = `postmortem-ai-${alert.ruleId}.md`
    try {
      const file = await window.aiss.files.saveText(name, markdown)
      if (file) {
        setSaved(draft)
        showToast(t('a5.toastExported'))
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : String(e), { kind: 'error' })
    }
  }

  if (!aiConfigured || plan === 'need-ai') {
    return (
      <div className="workspace-panel" data-testid="a5-tab">
        <AiConfigCard context={t('a5.needAi')} onConfigure={onOpenSettings} />
      </div>
    )
  }

  return (
    <div className="workspace-panel a5-tab" data-testid="a5-tab">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{t('a5.tabTitle', { title: `${alert.hostTitle} ${alert.ruleId}` })}</h2>
        <div className="workspace-panel-actions">
          <button type="button" className="primary" data-testid="a5-export" disabled={phase !== 'ready'} onClick={() => void save()}>
            {t('a5.export')}
          </button>
          <button type="button" data-testid="a5-regen" onClick={() => void regen()}>{t('a5.regen')}</button>
          {onOpenTimeline ? <button type="button" onClick={onOpenTimeline}>{t('w4.seg.timeline', { n: events.length })}</button> : null}
          <button type="button" onClick={() => void navigator.clipboard.writeText(exportPostmortemMarkdown(draft, locale === 'en' ? 'en' : 'zh'))}>
            {t('a5.copyAll')}
          </button>
        </div>
      </div>
      <div className="workspace-panel-body">
        <p className="l7-muted">{t('a5.hint')}</p>
        {phase === 'loading' ? <p data-testid="a5-loading">{t('a5.loading')}</p> : null}
        {phase === 'error' ? (
          <div className="l2-error" data-testid="a5-error">
            <span>{error}</span>
            <button type="button" onClick={() => void generate()}>{t('a5.regen')}</button>
          </div>
        ) : null}
        <label className="a5-field">
          <span>{t('a5.cause')}</span>
          <textarea data-testid="a5-cause" value={draft.cause} onChange={(e) => setDraft({ ...draft, cause: e.target.value })} rows={4} />
        </label>
        <label className="a5-field">
          <span>{t('a5.done')}</span>
          <textarea data-testid="a5-done" value={draft.done} onChange={(e) => setDraft({ ...draft, done: e.target.value })} rows={5} />
        </label>
        <label className="a5-field">
          <span>{t('a5.open')}</span>
          <textarea data-testid="a5-open" value={draft.followUps} onChange={(e) => setDraft({ ...draft, followUps: e.target.value })} rows={3} />
        </label>
        <p>{t('a5.suggest')}</p>
        {actions.map((row) => (
          <div key={row.command} className="a5-cmd" data-testid="a5-command">
            <code>{row.command}</code>
            <button
              type="button"
              data-testid="a5-copy"
              onClick={() => void navigator.clipboard.writeText(row.command)}
            >
              {t('a5.copy')}
            </button>
          </div>
        ))}
        {dirty ? <p className="l7-muted" data-testid="a5-dirty">{t('a5.dirty')}</p> : null}
        <p className="l7-muted"><Icon name="sparkles" size={12} /> {t('a5.redactNote')}</p>
      </div>
    </div>
  )
}
