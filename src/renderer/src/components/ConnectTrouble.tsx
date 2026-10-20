import { useEffect, useRef } from 'react'
import {
  acceptPrimaryAction,
  connectionTechnicalDetail,
  jumpTroubleDetail,
  orderedActions,
  primaryAction,
  troubleshootConnection,
  type TriageAction,
  type TroubleId
} from '@shared/connect-trouble'
import { disconnectStatusSentence } from '@shared/status-bar'
import { useI18n, type MessageKey } from '../lib/i18n'
import { showToast } from '../lib/toast'

/** Human primary-cause lines. Dropped connections reuse the PNG-7 status sentence. */
export const PNG5_CAUSE: Record<TroubleId, MessageKey> = {
  refused: 'png5.cause.refused',
  timeout: 'png5.cause.timeout',
  dns: 'png5.cause.dns',
  auth: 'png5.cause.auth',
  jump: 'png5.cause.jump',
  dropped: 'png5.cause.dropped',
  unreachable: 'png5.cause.unreachable',
  generic: 'png5.cause.generic'
}

type Props = {
  raw: string
  host?: string
  busy?: boolean
  onEdit: (focus?: 'jump' | 'cert' | null) => void
  onRetry: () => void
  /** D83: builds redacted diagnostics text on demand */
  diag?: () => string
}

/** PNG-5: one cause sentence, at most three checks, technical detail collapsed. */
export default function ConnectTrouble({ raw, host = '', busy = false, onEdit, onRetry, diag }: Props) {
  const { t, locale } = useI18n()
  const item = troubleshootConnection(raw)
  const actions = orderedActions(item)
  const primary = primaryAction(item)
  const loc = locale === 'en' ? 'en' : 'zh-CN'
  const jump = item.id === 'jump' ? jumpTroubleDetail(raw) : null
  const cause =
    item.id === 'dropped'
      ? disconnectStatusSentence(host, loc)
      : jump
        ? t(`png5.cause.jump.${jump.reasonKind}` as MessageKey, {
            hop: jump.hop,
            total: jump.total,
            name: jump.name
          })
        : t(PNG5_CAUSE[item.id])
  const detail = connectionTechnicalDetail(raw)
  const showDetail = Boolean(detail) && detail !== cause
  const lock = useRef(false)

  useEffect(() => {
    if (!busy) lock.current = false
  }, [busy])

  const run = (action: TriageAction) => {
    const isPrimary = action === primary
    if (isPrimary && (lock.current || !acceptPrimaryAction(busy))) return
    if (isPrimary) lock.current = true
    if (action === 'edit') onEdit(item.id === 'jump' ? 'jump' : null)
    else if (action === 'keys') onEdit('cert')
    else onRetry()
    if (isPrimary) queueMicrotask(() => { lock.current = false })
  }

  return (
    <div
      className="pf5-banner connect-trouble"
      role="alert"
      data-testid="connect-trouble"
      data-kind={item.id}
      data-hop-kind={jump?.reasonKind ?? undefined}
      data-primary={item.primary}
      data-actions={actions.length}
      data-busy={busy ? '1' : '0'}
    >
      <p className="connect-trouble-cause" data-testid="png5-cause">{cause}</p>
      <div className="connect-trouble-actions">
        {actions.map((action) => {
          const isPrimary = action === primary
          const label =
            action === 'keys'
              ? t('png5.action.keys')
              : action === 'edit'
                ? t('pf5.editConn')
                : item.id === 'dropped'
                  ? t('pf5.reconnect')
                  : t('pf5.retry')
          return (
            <button
              key={action}
              type="button"
              className={isPrimary ? 'primary' : undefined}
              data-testid={`png5-action-${action}`}
              data-primary={isPrimary ? '1' : '0'}
              disabled={isPrimary && busy}
              aria-busy={isPrimary && busy ? true : undefined}
              onClick={() => run(action)}
            >
              {label}
            </button>
          )
        })}
        {diag ? (
          <button
            type="button"
            className="connect-trouble-diag"
            data-testid="connect-copy-diag"
            title={t('d83.tip')}
            onClick={() => {
              const text = diag()
              void navigator.clipboard.writeText(text).then(
                () => showToast(t('d83.copied')),
                () => showToast(t('d49.copyFail'), { kind: 'error' })
              )
            }}
          >
            {t('d83.copy')}
          </button>
        ) : null}
      </div>
      {showDetail ? (
        <details className="pf5-details connect-trouble-details" data-testid="png5-details">
          <summary>{t('png5.details')}</summary>
          <pre>{detail}</pre>
        </details>
      ) : null}
    </div>
  )
}
