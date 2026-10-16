import { useCallback, useEffect, useState } from 'react'
import { SAFETY_TIERS, type SafetyTier } from '@shared/safety-tier'
import { tg, type MessageKey } from '../lib/i18n'

const TIER_KEY: Record<SafetyTier, MessageKey> = {
  observe: 'safety.observe',
  confirm: 'safety.confirm',
  trusted: 'safety.trusted',
  autopilot: 'safety.autopilot'
}

const HINT_KEY: Record<SafetyTier, MessageKey> = {
  observe: 'safety.observeHint',
  confirm: 'safety.confirmHint',
  trusted: 'safety.trustedHint',
  autopilot: 'safety.autopilotHint'
}

/** Global safety tier. Host and session overrides live on the AI panel. */
export default function SafetyTierSettings() {
  const [tier, setTier] = useState<SafetyTier>('confirm')
  const [hosts, setHosts] = useState('')
  const [allowHigh, setAllowHigh] = useState(false)
  const [hint, setHint] = useState<string | null>(null)

  const load = useCallback(() => {
    void window.aiss.ai.getSettings().then((s) => {
      setTier(s.safetyTier ?? 'confirm')
      setHosts((s.autopilotAllowHosts ?? []).join('\n'))
      setAllowHigh(s.autopilotAllowHighRisk === true)
    })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const flash = () => {
    setHint(tg('safety.saved'))
    window.setTimeout(() => setHint(null), 1500)
    window.dispatchEvent(new CustomEvent('aiss-ai-settings-saved'))
  }

  const saveTier = (next: SafetyTier) => {
    setTier(next)
    void window.aiss.ai.setSettings({ safetyTier: next }).then(flash)
  }

  return (
    <fieldset className="settings-channel" data-testid="safety-tier">
      <legend>{tg('safety.tier')}</legend>
      <p className="l7-muted">{tg('safety.hint')}</p>
      <div className="n1-sources" role="radiogroup" aria-label={tg('safety.tier')}>
        {SAFETY_TIERS.map((id) => (
          <label key={id} className="n1-choice">
            <input
              type="radio"
              name="safety-tier"
              checked={tier === id}
              onChange={() => saveTier(id)}
            />
            {tg(TIER_KEY[id])}
          </label>
        ))}
      </div>
      <p className="l7-muted">{tg(HINT_KEY[tier])}</p>
      {tier === 'autopilot' ? (
        <>
          <label className="n1-mirror">
            {tg('safety.allowHosts')}
            <textarea
              data-testid="safety-allow-hosts"
              value={hosts}
              rows={3}
              spellCheck={false}
              onChange={(e) => setHosts(e.target.value)}
              onBlur={() => {
                const list = hosts.split(/\r?\n/).map((row) => row.trim()).filter(Boolean)
                void window.aiss.ai.setSettings({ autopilotAllowHosts: list }).then(() => {
                  flash()
                  load()
                })
              }}
            />
          </label>
          <label className="settings-row">
            <input
              type="checkbox"
              data-testid="safety-allow-high"
              checked={allowHigh}
              onChange={(e) => {
                const next = e.target.checked
                setAllowHigh(next)
                void window.aiss.ai.setSettings({ autopilotAllowHighRisk: next }).then(flash)
              }}
            />
            {tg('safety.allowHigh')}
          </label>
          <p className="l7-muted">{tg('safety.allowHighHint')}</p>
        </>
      ) : null}
      {hint ? <p className="l7-muted">{hint}</p> : null}
    </fieldset>
  )
}
