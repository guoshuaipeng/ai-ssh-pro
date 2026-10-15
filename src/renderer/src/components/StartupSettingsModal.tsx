import type { StartupMode } from '@shared/startup-pref'
import { useI18n } from '../lib/i18n'
import Modal from './Modal'

const MODES: StartupMode[] = ['home', 'last', 'blank']

export default function StartupSettingsModal({
  open,
  value,
  onChange,
  restoreLayout,
  onRestoreLayout,
  onClose
}: {
  open: boolean
  value: StartupMode
  onChange: (mode: StartupMode) => void
  restoreLayout: boolean
  onRestoreLayout: (on: boolean) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const label = (mode: StartupMode) => (mode === 'home' ? t('l7.startupHome') : mode === 'last' ? t('l7.startupLast') : t('l7.startupBlank'))
  return (
    <Modal open={open} title={t('l7.startupTitle')} onClose={onClose} width={480} testId="startup-settings">
      <p className="l7-muted">{t('l7.startupHelp')}</p>
      <div className="l7-startup">
        <div role="radiogroup" aria-label={t('l7.startupTitle')}>
          {MODES.map((mode) => (
            <label key={mode} className={value === mode ? 'is-on' : ''}>
              <input type="radio" name="startup-mode" checked={value === mode} onChange={() => onChange(mode)} />
              <span>{label(mode)}</span>
            </label>
          ))}
        </div>
        <label className={restoreLayout ? 'is-on' : ''} data-testid="startup-restore-layout">
          <input type="checkbox" checked={restoreLayout} onChange={(e) => onRestoreLayout(e.target.checked)} />
          <span>{t('settings.restoreTabs')}</span>
        </label>
      </div>
    </Modal>
  )
}
