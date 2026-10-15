import { useEffect, useState } from 'react'
import {
  LOOP_STEPS,
  clickLoop,
  deriveProgress,
  loadLoop,
  loadLoopPrefs,
  type LoopClick,
  type LoopStep
} from '@shared/alert-loop'
import { eventsFor } from '@shared/timeline'
import { loadPlaybooks } from '@shared/playbook'
import { findAlertDraft } from '@shared/playbook-draft'
import { useI18n, type MessageKey } from '../lib/i18n'
import { showToast } from '../lib/toast'

const LABEL: Record<LoopStep, MessageKey> = {
  alert: 'w7.s1',
  locate: 'w7.s2',
  ai: 'w7.s3',
  playbook: 'w7.s4',
  diff: 'w7.s5'
}

type Props = {
  alertId: string
  aiConfigured: boolean
  onFocusAlert: () => void
  onLocate: () => void
  onAi: () => void
  onNeedAi: () => void
  onPlaybook: () => void
  onGenerate: () => void
  onOpenSftp: () => void
}

/** W7 single-line navigator. Missing prerequisites toast instead of a silent jump. */
export default function LoopNav(props: Props) {
  const { t } = useI18n()
  const [show, setShow] = useState(() => loadLoopPrefs().show)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const sync = () => {
      setShow(loadLoopPrefs().show)
      setTick((n) => n + 1)
    }
    window.addEventListener('aiss-loop-pref', sync)
    window.addEventListener('aiss-loop-mark', sync)
    return () => {
      window.removeEventListener('aiss-loop-pref', sync)
      window.removeEventListener('aiss-loop-mark', sync)
    }
  }, [])
  if (!show) return null
  const progress = deriveProgress(eventsFor(props.alertId), loadLoop(props.alertId))
  const hasDraft = Boolean(findAlertDraft(loadPlaybooks(), props.alertId))
  void tick
  const done = {
    alert: true,
    locate: progress.locate,
    ai: progress.ai,
    playbook: progress.playbook || hasDraft,
    diff: progress.diff
  }
  const current = LOOP_STEPS.find((s) => !done[s]) ?? 'diff'
  const onClick = (step: LoopStep) => {
    const click: LoopClick = clickLoop(step, progress, { aiConfigured: props.aiConfigured, hasDraft })
    if (click.action === 'focus-alert') props.onFocusAlert()
    else if (click.action === 'locate') props.onLocate()
    else if (click.action === 'ai') props.onAi()
    else if (click.action === 'need-ai') props.onNeedAi()
    else if (click.action === 'playbook-focus') props.onPlaybook()
    else if (click.action === 'playbook-generate') props.onGenerate()
    else if (click.action === 'playbook-toast') {
      showToast(t('w7.toastPlaybook'), {
        action: { label: t('w7.genPb'), run: props.onGenerate }
      })
    } else if (click.action === 'diff-toast') {
      showToast(t('w7.toastDiff'), { action: { label: t('w7.gotoSftp'), run: props.onOpenSftp } })
    } else props.onOpenSftp()
  }
  return (
    <div className="w7-loop" data-testid="w7-loop" role="navigation" aria-label={t('w7.settings')}>
      {LOOP_STEPS.map((step, i) => (
        <span key={step} className="w7-step-wrap">
          {i > 0 ? <span className="w7-arrow" aria-hidden>→</span> : null}
          <button
            type="button"
            className={`w7-step${done[step] ? ' is-done' : ''}${step === current ? ' is-current' : ''}`}
            data-testid={`w7-${step}`}
            data-state={done[step] ? 'done' : step === current ? 'current' : 'open'}
            title={t(LABEL[step])}
            onClick={() => onClick(step)}
          >
            <span className="w7-mark" data-mark={done[step] ? 'done' : step === current ? 'current' : 'open'} aria-hidden />
            <span className="w7-label">{t(LABEL[step])}</span>
          </button>
        </span>
      ))}
    </div>
  )
}
