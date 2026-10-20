import { useI18n } from '../lib/i18n'

type Props = {
  value: string
  onChange: (v: string) => void
  /** D13c: Enter when the text is an address */
  onEnter?: () => boolean
}

/** 侧栏会话搜索输入 */
export default function SessionSearchBar({ value, onChange, onEnter }: Props) {
  const { t } = useI18n()
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.nativeEvent.isComposing && onEnter?.()) e.preventDefault()
        }}
        data-testid="sidebar-search"
        placeholder={t('sidebar.searchPlaceholder')}
        aria-label={t('sidebar.searchLabel')}
        style={{ width: '100%' }}
      />
    </div>
  )
}
