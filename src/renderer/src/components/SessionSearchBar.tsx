import { useI18n } from '../lib/i18n'

type Props = {
  value: string
  onChange: (v: string) => void
  /** D13c: Enter when the text is an address */
  onEnter?: () => boolean
  /** D53: ArrowDown moves into the list */
  onArrowDown?: () => boolean
}

/** 侧栏会话搜索输入 */
export default function SessionSearchBar({ value, onChange, onEnter, onArrowDown }: Props) {
  const { t } = useI18n()
  return (
    <div className="field" style={{ marginBottom: 0 }}>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter' && onEnter?.()) e.preventDefault()
          // D53: Esc clears the filter, ArrowDown jumps to the first match
          else if (e.key === 'Escape' && value) {
            e.preventDefault()
            e.stopPropagation()
            onChange('')
          } else if (e.key === 'ArrowDown' && onArrowDown?.()) e.preventDefault()
        }}
        data-testid="sidebar-search"
        placeholder={t('sidebar.searchPlaceholder')}
        aria-label={t('sidebar.searchLabel')}
        style={{ width: '100%' }}
      />
    </div>
  )
}
