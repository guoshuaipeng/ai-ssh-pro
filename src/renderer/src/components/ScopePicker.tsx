import type { DashScope } from '@shared/dashboard-scope'
import { useI18n } from '../lib/i18n'

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
  return (
    <div className="scope-picker" data-testid="scope-picker">
      <select
        aria-label={t('l7.scope')}
        value={scope.mode}
        onChange={(e) => {
          const mode = e.target.value as DashScope['mode']
          if (mode === 'all') onChange({ mode: 'all' })
          else if (mode === 'group') onChange({ mode: 'group', folderId: scope.folderId || folders[0]?.id })
          else onChange({ mode: 'custom', ids: scope.ids ?? [] })
        }}
      >
        <option value="all">{t('l7.scopeAll')}</option>
        <option value="group">{t('l7.scopeGroup')}</option>
        <option value="custom">{t('l7.scopeCustom')}</option>
      </select>
      {scope.mode === 'group' ? (
        <select
          aria-label={t('l7.scopeGroup')}
          value={scope.folderId ?? ''}
          onChange={(e) => onChange({ mode: 'group', folderId: e.target.value })}
        >
          {folders.length === 0 ? <option value="">{t('l7.noGroup')}</option> : null}
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      ) : null}
      {scope.mode === 'custom' && hosts ? (
        <select
          aria-label={t('l7.scopeCustom')}
          multiple
          value={scope.ids ?? []}
          onChange={(e) => {
            const ids = Array.from(e.target.selectedOptions).map((o) => o.value)
            onChange({ mode: 'custom', ids })
          }}
        >
          {hosts.map((h) => (
            <option key={h.id} value={h.id}>
              {h.title}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  )
}
