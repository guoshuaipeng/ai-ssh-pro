import { useEffect, useState } from 'react'
import {
  DEFAULT_RECONNECT_POLICY,
  KEEPALIVE_PRESETS,
  loadReconnectPolicy,
  parseDelaySeconds,
  parseKeepAliveSec,
  saveReconnectPolicy,
  type ReconnectMode,
  type ReconnectPolicy
} from '@shared/reconnect-policy'
import { useI18n } from '../lib/i18n'
import Select from './ui/Select'
import { CONNECT_TIMEOUT_PRESETS } from '@shared/connect-timeout'

const MODES: ReconnectMode[] = ['off', 'standard', 'robust', 'custom']

function publish(policy: ReconnectPolicy): void {
  const saved = saveReconnectPolicy(policy)
  window.dispatchEvent(new CustomEvent('aiss-reconnect-policy', { detail: saved }))
}

/** Settings → Connections → reconnect policy. Changes apply to the next disconnect. */
export default function ReconnectPolicySection({ anchor }: { anchor?: string | null }) {
  const { t } = useI18n()
  const [policy, setPolicy] = useState<ReconnectPolicy>(() => loadReconnectPolicy())
  const [delayText, setDelayText] = useState(() => loadReconnectPolicy().customDelaysSec.join(', '))
  const [delayError, setDelayError] = useState(false)
  const [kaMode, setKaMode] = useState<string>(() => {
    const sec = loadReconnectPolicy().keepAliveSec
    if (sec == null) return 'off'
    if ((KEEPALIVE_PRESETS as readonly number[]).includes(sec)) return String(sec)
    return 'custom'
  })
  const [kaText, setKaText] = useState(() => String(loadReconnectPolicy().keepAliveSec ?? 60))
  const [kaError, setKaError] = useState(false)

  useEffect(() => {
    if (anchor !== 'l9-reconnect') return
    document.querySelector('[data-testid="l9-reconnect"]')?.scrollIntoView({ block: 'nearest' })
  }, [anchor])

  const commit = (next: ReconnectPolicy) => {
    setPolicy(next)
    publish(next)
  }

  const hint =
    policy.mode === 'standard'
      ? t('l9.standardHint')
      : policy.mode === 'off'
        ? t('l9.offHint')
        : policy.mode === 'robust'
          ? t('l9.robustHint')
          : t('l9.customHint')

  return (
    <section className="l9-policy" data-testid="l9-reconnect" data-anchor="l9-reconnect">
      <h4>{t('l9.section')}</h4>
      <label className="settings-row l9-row">
        <span>{t('l9.mode')}</span>
        <select
          data-testid="l9-mode"
          value={policy.mode}
          onChange={(e) => commit({ ...policy, mode: e.target.value as ReconnectMode })}
        >
          {MODES.map((mode) => (
            <option key={mode} value={mode}>
              {t(mode === 'off' ? 'l9.off' : mode === 'standard' ? 'l9.standard' : mode === 'robust' ? 'l9.robust' : 'l9.custom')}
            </option>
          ))}
        </select>
      </label>
      <p className="l7-muted">{hint}</p>
      {policy.mode === 'robust' ? (
        <label className="settings-row l9-row">
          <span>{t('l9.maxTries')}</span>
          <input
            data-testid="l9-robust-max"
            type="number"
            min={3}
            max={8}
            value={policy.robustMaxAttempts}
            onChange={(e) => commit({ ...policy, robustMaxAttempts: Number(e.target.value) })}
          />
        </label>
      ) : null}
      {policy.mode === 'custom' ? (
        <>
          <label className="settings-row l9-row">
            <span>{t('l9.delays')}</span>
            <input
              data-testid="l9-delays"
              value={delayText}
              onChange={(e) => {
                const text = e.target.value
                setDelayText(text)
                const parsed = parseDelaySeconds(text)
                setDelayError(!parsed.ok)
                if (parsed.ok) commit({ ...policy, customDelaysSec: parsed.delaysSec })
              }}
            />
          </label>
          {delayError ? <p className="l9-error" data-testid="l9-delay-error">{t('l9.delayError')}</p> : null}
          <label className="settings-row l9-row">
            <span>{t('l9.maxTries')}</span>
            <input
              data-testid="l9-custom-max"
              type="number"
              min={1}
              max={10}
              value={policy.customMaxAttempts}
              onChange={(e) => commit({ ...policy, customMaxAttempts: Number(e.target.value) })}
            />
          </label>
        </>
      ) : null}
      <label className="settings-row l9-row">
        <span>{t('l9.keepalive')}</span>
        <select
          data-testid="l9-keepalive"
          value={kaMode}
          onChange={(e) => {
            const value = e.target.value
            setKaMode(value)
            setKaError(false)
            if (value === 'off') commit({ ...policy, keepAliveSec: null })
            else if (value === 'custom') {
              const parsed = parseKeepAliveSec(kaText)
              setKaError(!parsed.ok)
              if (parsed.ok) commit({ ...policy, keepAliveSec: parsed.sec })
            } else commit({ ...policy, keepAliveSec: Number(value) })
          }}
        >
          <option value="off">{t('l9.kaOff')}</option>
          {KEEPALIVE_PRESETS.map((sec) => (
            <option key={sec} value={String(sec)}>
              {sec}s
            </option>
          ))}
          <option value="custom">{t('l9.custom')}</option>
        </select>
      </label>
      {kaMode === 'custom' ? (
        <label className="settings-row l9-row">
          <span>{t('l9.kaCustom')}</span>
          <input
            data-testid="l9-keepalive-custom"
            value={kaText}
            onChange={(e) => {
              const text = e.target.value
              setKaText(text)
              const parsed = parseKeepAliveSec(text)
              setKaError(!parsed.ok)
              if (parsed.ok) commit({ ...policy, keepAliveSec: parsed.sec })
            }}
          />
        </label>
      ) : null}
      {kaError ? <p className="l9-error" data-testid="l9-ka-error">{t('l9.kaError')}</p> : null}
      <p className="l7-muted">{t('l9.kaHint')}</p>
      {policy.keepAliveSec == null ? (
        <p className="jump-issue" data-testid="l9-ka-off-nudge">
          {t('l9.kaOffNudge')}
        </p>
      ) : null}
      <label className="settings-row l9-row">
        <span>{t('d77.timeout')}</span>
        <Select
          testId="d77-connect-timeout"
          ariaLabel={t('d77.timeout')}
          value={String(policy.connectTimeoutSec)}
          options={(CONNECT_TIMEOUT_PRESETS as readonly number[]).concat(
            (CONNECT_TIMEOUT_PRESETS as readonly number[]).includes(policy.connectTimeoutSec) ? [] : [policy.connectTimeoutSec]
          ).map((n) => ({ value: String(n), label: t('d77.sec', { sec: String(n) }) }))}
          onChange={(v) => commit({ ...policy, connectTimeoutSec: Number(v) })}
        />
      </label>
      <p className="l7-muted">{t('d77.timeoutHint')}</p>
      <label className="settings-row">
        <input
          data-testid="l9-jump-prefer"
          type="checkbox"
          checked={policy.jumpRetryFromFailedHop}
          onChange={(e) => commit({ ...policy, jumpRetryFromFailedHop: e.target.checked })}
        />
        {t('l9.jumpPrefer')}
      </label>
      {policy.mode === 'standard' && policy.keepAliveSec == null && policy.jumpRetryFromFailedHop ? (
        <span className="sr-only" data-testid="l9-default">{DEFAULT_RECONNECT_POLICY.mode}</span>
      ) : null}
    </section>
  )
}
