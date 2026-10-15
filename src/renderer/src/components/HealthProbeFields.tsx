import { PROBE_HARD_MAX, type ProbePrefs, type ProbeScopeMode } from '@shared/health-probe'
import { useI18n } from '../lib/i18n'

/** Shared auto-sampling controls for the home ⋯ panel and Settings → Ops. */
export default function HealthProbeFields({
  prefs,
  tagOptions = [],
  onChange
}: {
  prefs: ProbePrefs
  tagOptions?: string[]
  onChange: (patch: Partial<ProbePrefs>) => void
}) {
  const { t } = useI18n()
  const toggleTag = (tag: string) => {
    const has = prefs.tags.includes(tag)
    onChange({ tags: has ? prefs.tags.filter((x) => x !== tag) : [...prefs.tags, tag], filterTags: true })
  }
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
      <p className="l7-muted l7c-section">{t('l7c.filterTags')}</p>
      <label className="settings-row">
        <input type="checkbox" checked={prefs.filterTags} onChange={(e) => onChange({ filterTags: e.target.checked })} />
        {t('l7c.filterTags')}
      </label>
      {prefs.filterTags ? (
        <div className="l7c-tags" data-testid="l7c-tags">
          {tagOptions.map((tag) => (
            <button key={tag} type="button" className={prefs.tags.includes(tag) ? 'is-on' : ''} onClick={() => toggleTag(tag)}>
              {tag}
            </button>
          ))}
        </div>
      ) : null}
      <label className="settings-row">
        <input type="checkbox" checked={prefs.prodOnly} onChange={(e) => onChange({ prodOnly: e.target.checked })} />
        {t('l7c.prodOnly')}
      </label>
      <label className="settings-row">
        <input
          type="checkbox"
          checked={prefs.prodOnly ? true : prefs.excludeReadonly}
          disabled={prefs.prodOnly}
          onChange={(e) => onChange({ excludeReadonly: e.target.checked })}
        />
        {t('l7c.excludeReadonly')}
      </label>
      {prefs.prodOnly ? <p className="l7-muted">{t('l7c.prodImpliesRo')}</p> : null}
      <p className="l7-muted l7c-section">{t('l7c.backoffCap')}</p>
      <label className="settings-row">
        <span>{t('l7c.backoffCap')}</span>
        <input
          type="number"
          min={1}
          max={30}
          value={prefs.backoffCapMin}
          aria-label={t('l7c.backoffCap')}
          onChange={(e) => {
            const n = Number(e.target.value)
            if (!Number.isFinite(n)) return
            onChange({ backoffCapMin: Math.max(1, Math.min(30, Math.round(n))) })
          }}
        />
        <span>{t('l7c.minutes')}</span>
      </label>
      <p className="l7-muted">{t('l7c.backoffHint')}</p>
      <p className="l7-muted">{t('l7b.prefNote')}</p>
    </div>
  )
}
