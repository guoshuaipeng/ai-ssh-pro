import { isEngineerLeak } from '@shared/product-error'
import { shareDisconnectCopy } from '@shared/status-bar'
import { quietFailureCopy } from '@shared/quiet-load'
import { tg, useI18n } from '../lib/i18n'
import Icon from './Icon'

export type DisconnectBannerModel = {
  phase: 'off' | 'countdown' | 'stopped' | 'exhausted'
  seconds: number
  attempt: number
  max: number
  host: string
  reason: string
  jumpHop: number | null
  jumpReason: string
  busy: boolean
  showEdit: boolean
}

type Props = {
  model: DisconnectBannerModel
  onNow: () => void
  onStop: () => void
  onHop: () => void
  onFull: () => void
  onClose: () => void
  onEdit: () => void
}

/** UX-14 banner extended with L9 countdown, stop, and jump resume. One row at 1366. */
function readableReason(raw: string, locale: 'zh-CN' | 'en', host: string): string {
  const leaked = isEngineerLeak(raw) || /(?:^|\n)\s*at\s+\S+/.test(raw)
  if (!raw.trim() || leaked) return quietFailureCopy(raw, locale, host).message
  return raw
}

export default function DisconnectBanner({ model, onNow, onStop, onHop, onFull, onClose, onEdit }: Props) {
  const { locale } = useI18n()
  const loc = locale === 'en' ? 'en' : 'zh-CN'
  const hop = model.jumpHop
  const jump = hop != null && hop > 0
  const exhausted = model.phase === 'exhausted'
  const countdown = model.phase === 'countdown'
  const stopped = model.phase === 'stopped'
  const reason = readableReason(model.reason, loc, model.host)
  const jumpReason = readableReason(model.jumpReason || model.reason, loc, model.host)
  const phaseText = exhausted
    ? tg('l9.fail', { host: model.host, reason: reason || tg('png5.title.generic') })
    : hop != null && hop > 0
      ? tg('l9.jumpFail', { n: hop, reason: jumpReason })
      : countdown
        ? tg('l9.bannerRetry', { n: model.seconds, i: model.attempt, max: model.max })
        : stopped
          ? tg('l9.bannerStopped')
          : tg('l9.bannerOff')
  const text = shareDisconnectCopy(model.host, loc, phaseText)

  const phaseClass = exhausted ? 'is-exhausted' : stopped || model.phase === 'off' ? 'is-stopped' : 'is-retry'

  return (
    <div className={`session-disconnect-banner ${phaseClass}`} role="status" data-testid="l9-banner" data-phase={model.phase} data-jump={jump ? '1' : '0'}>
      <span className="l9-text">{text}</span>
      <div className="l9-actions">
        {hop != null && hop > 0 && !exhausted ? (
          <button type="button" data-testid="l9-hop" disabled={model.busy} title={tg('l9.retryHop', { n: hop })} onClick={onHop}>
            <Icon name="history" size={14} />
            <span className="l9-btn-label">{tg('l9.retryHop', { n: hop })}</span>
          </button>
        ) : null}
        {countdown && !jump ? (
          <button type="button" className="primary" data-testid="l9-now" disabled={model.busy} title={tg('l9.now')} onClick={onNow}>
            <Icon name="history" size={14} />
            <span className="l9-btn-label">{tg('l9.now')}</span>
          </button>
        ) : null}
        {jump && !exhausted ? (
          <>
            <button type="button" className="l9-full-wide" data-testid="l9-full" disabled={model.busy} title={tg('l9.fullRetry')} onClick={onFull}>
              <span className="l9-btn-label">{tg('l9.fullRetry')}</span>
            </button>
            <details className="l9-more l9-full-narrow">
              <summary aria-label={tg('l7.shortcut.more')}>⋯</summary>
              <button type="button" data-testid="l9-full-narrow" disabled={model.busy} onClick={onFull}>
                {tg('l9.fullRetry')}
              </button>
            </details>
          </>
        ) : null}
        {countdown ? (
          <button type="button" data-testid="l9-stop" title={tg('l9.stop')} onClick={onStop}>
            <Icon name="square" size={14} />
            <span className="l9-btn-label">{tg('l9.stop')}</span>
          </button>
        ) : null}
        {!countdown ? (
          <button type="button" className="primary" data-testid="l9-reconnect" disabled={model.busy} title={tg('l9.reconnect')} onClick={onFull}>
            <Icon name="history" size={14} />
            <span className="l9-btn-label">{tg('l9.reconnect')}</span>
          </button>
        ) : null}
        {exhausted && model.showEdit ? (
          <button type="button" data-testid="l9-edit" onClick={onEdit}>
            <span className="l9-btn-label">{tg('pf5.editConn')}</span>
          </button>
        ) : null}
        {(exhausted || model.phase === 'off' || stopped) && !countdown ? (
          <button type="button" data-testid="l9-close" title={tg('l9.closeTab')} onClick={onClose}>
            <span className="l9-btn-label">{tg('l9.closeTab')}</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
