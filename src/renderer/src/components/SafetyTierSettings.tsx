import { useCallback, useEffect, useState } from 'react'
import { AI_POLICIES, DEFAULT_AI_POLICY, globalAiPolicy, isAiPolicy, policyTier, type AiPolicy } from '@shared/ai-policy'
import { safetyBandTone, safetyLadderBand } from '@shared/safety-visibility'
import { tg, type MessageKey } from '../lib/i18n'

const POLICY_KEY: Record<AiPolicy, MessageKey> = {
  suggest: 'policy.suggest',
  ask: 'policy.ask',
  auto: 'policy.auto'
}

const HINT_KEY: Record<AiPolicy, MessageKey> = {
  suggest: 'policy.suggestHint',
  ask: 'policy.askHint',
  auto: 'policy.autoHint'
}

type HostOverride = { id: string; label: string; policy: AiPolicy }

/**
 * M21: the global AI policy — three choices, one advanced switch under 自动执行, and a
 * count of hosts that set their own policy (edited on the host's 安全 card / AI chip).
 */
export default function SafetyTierSettings() {
  const [policy, setPolicy] = useState<AiPolicy>(DEFAULT_AI_POLICY)
  const [autoHigh, setAutoHigh] = useState(false)
  const [overrides, setOverrides] = useState<HostOverride[]>([])
  const [showOverrides, setShowOverrides] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.aiss.ai.getSettings().then((s) => {
      setPolicy(globalAiPolicy(s))
      setAutoHigh(s.aiAutoHighRisk === true)
    })
    void window.aiss.sessions
      .list()
      .then((state) => {
        setOverrides(
          state.profiles
            .filter((p) => isAiPolicy(p.aiPolicy))
            .map((p) => ({ id: p.id, label: p.label || p.host, policy: p.aiPolicy as AiPolicy }))
        )
      })
      .catch(() => setOverrides([]))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('aiss-ai-settings-saved', load)
    return () => window.removeEventListener('aiss-ai-settings-saved', load)
  }, [load])

  const flash = () => {
    setHint(tg('safety.saved'))
    window.setTimeout(() => setHint(null), 1500)
    window.dispatchEvent(new CustomEvent('aiss-ai-settings-saved'))
  }

  const savePolicy = (next: AiPolicy) => {
    setPolicy(next)
    void window.aiss.ai.setSettings({ aiPolicy: next }).then(flash)
  }

  return (
    <fieldset className="settings-channel" data-testid="safety-tier">
      <legend>{tg('policy.title')}</legend>
      <p className="l7-muted">{tg('safety.hint')}</p>
      <div className="n1-sources policy-radios" role="radiogroup" aria-label={tg('policy.title')} data-testid="ai-policy-radios">
        {AI_POLICIES.map((id) => {
          const band = safetyLadderBand(policyTier(id))
          return (
            <label key={id} className={`n1-choice policy-choice${policy === id ? ' is-active' : ''}`} data-band={band} data-policy={id}>
              <input type="radio" name="ai-policy" checked={policy === id} onChange={() => savePolicy(id)} />
              <span className={`safety-band-dot safety-band-${safetyBandTone(band)}`} aria-hidden="true" />
              <span className="policy-choice-text">
                <span className="policy-choice-name">{tg(POLICY_KEY[id])}</span>
                <span className="l7-muted policy-choice-hint">{tg(HINT_KEY[id])}</span>
              </span>
            </label>
          )
        })}
      </div>
      {policy === 'auto' ? (
        <div className="policy-advanced" data-testid="ai-policy-advanced">
          <label className="settings-row">
            <input
              type="checkbox"
              role="switch"
              data-testid="ai-auto-high-risk"
              aria-checked={autoHigh}
              checked={autoHigh}
              onChange={(e) => {
                const next = e.target.checked
                setAutoHigh(next)
                void window.aiss.ai.setSettings({ aiAutoHighRisk: next }).then(flash)
              }}
            />
            {tg('policy.autoHighRisk')}
          </label>
          <p className="l7-muted">{tg('policy.autoHighRiskHint')}</p>
        </div>
      ) : null}
      {overrides.length > 0 ? (
        <>
          <button
            type="button"
            className="link-btn policy-overrides"
            data-testid="ai-policy-overrides"
            aria-expanded={showOverrides}
            onClick={() => setShowOverrides((v) => !v)}
          >
            {tg('policy.overrides', { n: overrides.length })}
          </button>
          {showOverrides ? (
            <ul className="policy-override-list" data-testid="ai-policy-override-list">
              {overrides.map((o) => (
                <li key={o.id}>
                  <span>{o.label}</span>
                  <span className="l7-muted">{tg(POLICY_KEY[o.policy])}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
      {hint ? <p className="l7-muted">{hint}</p> : null}
    </fieldset>
  )
}
