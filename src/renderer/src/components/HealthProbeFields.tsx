import { PROBE_HARD_MAX, type ProbePrefs, type ProbeScopeMode } from '@shared/health-probe'
import { useI18n } from '../lib/i18n'

/** Shared auto-sampling controls for the home ⋯ panel and Settings → Ops. */
export default function HealthProbeFields({
  prefs,
  onChange
}: {
  prefs: ProbePrefs
  onChange: (patch: Partial<ProbePrefs>) => void
}) {
  const { t } = useI18n()
  return (
    <div className="l7b-fields" data-testid="l7b-fields">
      <label className="settings-row">
        <input type="checkbox" checked={prefs.enabled} onChange={(e) => onChange({ enabled: e.target.checked })} />
        {t('l7b.autoOn')}
      </label>
      <label className="settings-row">
        <span>{t('l7b.scope')}</span>
        <select
          value={prefs.scope}
          aria-label={t('l7b.scope')}
          onChange={(e) => onChange({ scope: e.target.value as ProbeScopeMode })}
        >
          <option value="group">{t('l7b.scopeGroup')}</option>
          <option value="recent">{t('l7b.scopeRecent')}</option>
          <option value="all">{t('l7b.scopeAll')}</option>
        </select>
      </label>
      <label className="settings-row">
        <span>{t('l7b.maxConcurrent')}</span>
        <input
          type="number"
          min={1}
          max={PROBE_HARD_MAX}
          value={prefs.maxConcurrent}
          aria-label={t('l7b.maxConcurrent')}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            onChange({ maxConcurrent: Math.max(1, Math.min(PROBE_HARD_MAX, Math.round(n))) })
          }}
        />
      </label>
      <p className="l7-muted">{t('l7b.prefNote')}</p>
    </div>
  )
}
