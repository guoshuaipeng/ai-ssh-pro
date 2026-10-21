import type { DashScope } from '@shared/dashboard-scope'
import { useI18n } from '../lib/i18n'
import Select from './ui/Select'

/** OH2: themed scope picker (no native select); custom scope = toggle chips. */
export default function ScopePicker({
  scope,
  folders,
  hosts,
  onChange
}: {
  scope: DashScope
  folders: { id: string; name: string }[]
  hosts?: { id: string; title: string }[]
  onChange: (next: DashScope) => void
}) {
  const { t } = useI18n()
  const ids = scope.ids ?? []
  return (
    <div className="scope-picker" data-testid="scope-picker">
      <Select
        testId="scope-mode"
        ariaLabel={t('l7.scope')}
        value={scope.mode}
        onChange={(v) => {
          const mode = v as DashScope['mode']
          if (mode === 'all') onChange({ mode: 'all' })
          else if (mode === 'group') onChange({ mode: 'group', folderId: scope.folderId || folders[0]?.id })
          else onChange({ mode: 'custom', ids })
        }}
        options={[
          { value: 'all', label: t('l7.scopeAll') },
          { value: 'group', label: t('l7.scopeGroup') },
          { value: 'custom', label: t('l7.scopeCustom') }
        ]}
      />
      {scope.mode === 'group' ? (
        <Select
          testId="scope-group"
          ariaLabel={t('l7.scopeGroup')}
          value={scope.folderId ?? ''}
          placeholder={t('l7.noGroup')}
          disabled={folders.length === 0}
          onChange={(v) => onChange({ mode: 'group', folderId: v })}
          options={folders.map((f) => ({ value: f.id, label: f.name }))}
        />
      ) : null}
      {scope.mode === 'custom' && hosts ? (
        <div className="sn3-cats" role="group" aria-label={t('l7.scopeCustom')} data-testid="scope-hosts">
          {hosts.map((h) => {
            const on = ids.includes(h.id)
            return (
              <button
                key={h.id}
                type="button"
                className={`sn3-chip${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange({ mode: 'custom', ids: on ? ids.filter((x) => x !== h.id) : [...ids, h.id] })}
              >
                {h.title}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
