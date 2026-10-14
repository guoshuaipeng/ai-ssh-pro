import { useI18n } from '../lib/i18n'

type Props = {
  value: string
  onChange: (v: string) => void
}

/** 侧栏会话搜索输入 */
export default function SessionSearchBar({ value, onChange }: Props) {
  const { t } = useI18n()
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t('sidebar.searchPlaceholder')}
        aria-label={t('sidebar.searchLabel')}
        style={{ width: '100%' }}
      />
    </div>
  )
}
