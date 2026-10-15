import { troubleshootConnection, type TroubleId, type TroubleStepId } from '@shared/connect-trouble'
import { useI18n, type MessageKey } from '../lib/i18n'

const TITLE: Record<TroubleId, MessageKey> = {
  refused: 'png5.title.refused',
  timeout: 'png5.title.timeout',
  dns: 'png5.title.dns',
  auth: 'png5.title.auth',
  jump: 'png5.title.jump',
  dropped: 'png5.title.dropped',
  generic: 'png5.title.generic'
}

const STEP: Record<TroubleStepId, MessageKey> = {
  host: 'png5.step.host',
  port: 'png5.step.port',
  net: 'png5.step.net',
  user: 'png5.step.user',
  key: 'png5.step.key',
  jump: 'png5.step.jump',
  retry: 'png5.step.retry'
}

/** PNG-5: one title and a single-line checklist. Detail stays in the existing collapsed block. */
export default function ConnectTrouble({ raw }: { raw: string }) {
  const { t } = useI18n()
  const plan = troubleshootConnection(raw)
  return (
    <div className="connect-trouble" data-testid="connect-trouble" data-kind={plan.id} data-primary={plan.primary}>
      <span className="connect-trouble-title">{t(TITLE[plan.id])}</span>
      <ol className="connect-trouble-steps">
        {plan.steps.map((id) => (
          <li key={id}>{t(STEP[id])}</li>
        ))}
      </ol>
    </div>
  )
}
