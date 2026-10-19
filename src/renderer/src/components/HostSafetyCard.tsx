import { useCallback, useEffect, useState } from 'react'
import type { ProtectionLevel } from '@shared/protection'
import { AI_POLICIES, globalAiPolicy, isAiPolicy, resolveAiPolicy, type AiPolicy, type AiPolicySettings } from '@shared/ai-policy'
import { tg, type MessageKey } from '../lib/i18n'
import { ProtectionLevelField } from './ProtectionSection'

const POLICY_KEY: Record<AiPolicy, MessageKey> = {
  suggest: 'policy.suggest',
  ask: 'policy.ask',
  auto: 'policy.auto'
}

/** "（受生产保护限制）" / "（受只读保护限制）" after the effective policy, or nothing. */
export function policyCapNote(cappedBy: 'production' | 'readonly' | null): string {
  if (cappedBy === 'production') return tg('policy.capProduction')
  if (cappedBy === 'readonly') return tg('policy.capReadonly')
  return ''
}

/**
 * M22: host settings → 安全 card. Protection level and this host's AI policy side by side,
 * with the policy that actually applies once protection caps it.
 */
export default function HostSafetyCard({
  level,
  aiPolicy,
  onLevel,
  onAiPolicy
}: {
  level: ProtectionLevel
  aiPolicy?: AiPolicy
  onLevel: (level: ProtectionLevel) => void
  onAiPolicy: (policy: AiPolicy | undefined) => void
}) {
  const [settings, setSettings] = useState<AiPolicySettings>({})
  const load = useCallback(() => {
    void window.aiss.ai.getSettings().then((s) => setSettings(s))
  }, [])
  useEffect(() => {
    load()
    window.addEventListener('aiss-ai-settings-saved', load)
    return () => window.removeEventListener('aiss-ai-settings-saved', load)
  }, [load])

  const global = globalAiPolicy(settings)
  const resolved = resolveAiPolicy({ settings, hostPolicy: aiPolicy, protection: { level } })

  return (
    <section className="inv20-card host-safety-card" data-testid="host-safety-card" aria-label={tg('hostSafety.title')}>
      <header className="inv20-card-head">
        <strong>{tg('hostSafety.title')}</strong>
      </header>
      <div className="host-safety-body">
        <div className="host-safety-row">
          <span className="host-safety-label">{tg('l4.level')}</span>
          <ProtectionLevelField value={level} onChange={onLevel} name="host-safety-level" />
        </div>
        <label className="host-safety-row">
          <span className="host-safety-label">{tg('policy.title')}</span>
          <select
            data-testid="host-ai-policy"
            value={isAiPolicy(aiPolicy) ? aiPolicy : ''}
            onChange={(e) => onAiPolicy(isAiPolicy(e.target.value) ? e.target.value : undefined)}
          >
            <option value="">{tg('policy.followGlobal', { policy: tg(POLICY_KEY[global]) })}</option>
            {AI_POLICIES.map((id) => (
              <option key={id} value={id}>{tg(POLICY_KEY[id])}</option>
            ))}
          </select>
        </label>
        <p
          className={`host-safety-effective${resolved.cappedBy ? ' is-capped' : ''}`}
          data-testid="host-ai-effective"
          data-policy={resolved.effective}
          data-capped={resolved.cappedBy ?? ''}
        >
          {tg('policy.effective', { policy: tg(POLICY_KEY[resolved.effective]) })}
          {resolved.cappedBy ? <span className="host-safety-cap">{policyCapNote(resolved.cappedBy)}</span> : null}
        </p>
      </div>
    </section>
  )
}
