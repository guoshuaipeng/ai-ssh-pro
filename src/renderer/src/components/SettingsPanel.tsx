import { useMemo, useState } from 'react'
import type { StartupMode } from '@shared/startup-pref'
import { KEYMAP } from '@shared/keymap'
import { SETTINGS_SECTIONS, type SettingsSection } from '@shared/settings-nav'
import { useI18n, type MessageKey } from '../lib/i18n'
import { applyUiTheme, loadUiThemeId, UI_THEME_OPTIONS, type UiThemeId } from '../lib/ui-themes'
import { loadAutoUpdate, saveAutoUpdate } from '../lib/update-check'
import { TOUR_DONE_KEY } from './WelcomeTour'
import type { TerminalPrefs } from '@shared/ipc'
import AiConfigForm from './AiConfigForm'
import TerminalPrefsModal from './TerminalPrefsModal'

const SECTION_KEY: Record<SettingsSection, MessageKey> = {
  general: 'settings.general',
  appearance: 'settings.appearance',
  terminal: 'settings.terminal',
  connections: 'settings.connections',
  ai: 'settings.ai',
  shortcuts: 'settings.shortcuts',
  security: 'settings.security',
  backup: 'settings.backup',
  about: 'settings.about'
}

type Props = {
  section: SettingsSection
  onSection: (section: SettingsSection) => void
  startupMode: StartupMode
  onStartupMode: (mode: StartupMode) => void
  showHostStatus: boolean
  onShowHostStatus: (on: boolean) => void
  auditOn: boolean
  onAudit: (on: boolean) => void
  version: string
  onBackup: () => void
  onCloudSync: () => void
  onCheckUpdate: () => void
  onGithub: () => void
  onOpenMcp: () => void
  onOpenUpdates: () => void
  onTerminalSaved?: (prefs: TerminalPrefs) => void
}

export default function SettingsPanel({
  section,
  onSection,
  startupMode,
  onStartupMode,
  showHostStatus,
  onShowHostStatus,
  auditOn,
  onAudit,
  version,
  onBackup,
  onCloudSync,
  onCheckUpdate,
  onGithub,
  onOpenMcp,
  onOpenUpdates,
  onTerminalSaved
}: Props) {
  const { t, locale, setLocale } = useI18n()
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState<UiThemeId>(() => loadUiThemeId())
  const [autoUpdate, setAutoUpdate] = useState(() => loadAutoUpdate())
  const [tour, setTour] = useState(() => localStorage.getItem(TOUR_DONE_KEY) !== '1')
  const [autoIcon, setAutoIcon] = useState(() => localStorage.getItem('aiss.toolbar.autoIcon') !== '0')

  const needle = q.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!needle) return SETTINGS_SECTIONS
    return SETTINGS_SECTIONS.filter((id) => t(SECTION_KEY[id]).toLowerCase().includes(needle) || id.includes(needle))
  }, [needle, t])

  const active = visible.includes(section) ? section : visible[0]

  return (
    <div className="workspace-panel settings-root" data-testid="settings-panel">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{t('settings.title')}</h2>
      </div>
      <div className="settings-shell">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          <input
            className="settings-search"
            value={q}
            placeholder={t('settings.search')}
            aria-label={t('settings.search')}
            onChange={(e) => setQ(e.target.value)}
          />
          {visible.length === 0 ? <p className="l7-muted">{t('settings.none', { q })}</p> : null}
          {visible.map((id) => (
            <button key={id} type="button" className={active === id ? 'is-on' : ''} data-section={id} onClick={() => onSection(id)}>
              {t(SECTION_KEY[id])}
            </button>
          ))}
        </nav>
        <div className="settings-body" data-section={active || 'none'}>
          {active === 'general' ? (
            <section>
              <h3>{t('settings.general')}</h3>
              <label className="settings-row">
                <span>{t('settings.language')}</span>
                <select value={locale} onChange={(e) => setLocale(e.target.value === 'en' ? 'en' : 'zh-CN')}>
                  <option value="zh-CN">中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <fieldset className="settings-row">
                <legend>{t('settings.startupOpen')}</legend>
                {(['home', 'last', 'blank'] as const).map((mode) => (
                  <label key={mode}>
                    <input type="radio" name="startup-open" checked={startupMode === mode} onChange={() => onStartupMode(mode)} />
                    {t(mode === 'home' ? 'settings.startupHome' : mode === 'last' ? 'settings.startupLast' : 'settings.startupBlank')}
                  </label>
                ))}
              </fieldset>
              <label className="settings-row">
                <input
                  type="checkbox"
                  checked={startupMode === 'last'}
                  onChange={(e) => onStartupMode(e.target.checked ? 'last' : 'home')}
                />
                {t('settings.restoreTabs')}
              </label>
              <label className="settings-row">
                <input
                  type="checkbox"
                  checked={autoUpdate}
                  onChange={(e) => {
                    setAutoUpdate(e.target.checked)
                    saveAutoUpdate(e.target.checked)
                  }}
                />
                {t('settings.checkUpdates')}
              </label>
              <label className="settings-row">
                <input
                  type="checkbox"
                  checked={tour}
                  onChange={(e) => {
                    setTour(e.target.checked)
                    if (e.target.checked) localStorage.removeItem(TOUR_DONE_KEY)
                    else localStorage.setItem(TOUR_DONE_KEY, '1')
                  }}
                />
                {t('settings.tour')}
              </label>
            </section>
          ) : null}
          {active === 'appearance' ? (
            <section>
              <h3>{t('settings.appearance')}</h3>
              <div className="settings-themes">
                {UI_THEME_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={theme === opt.id ? 'is-on' : ''}
                    onClick={() => {
                      setTheme(opt.id)
                      applyUiTheme(opt.id)
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <label className="settings-row">
                <input
                  type="checkbox"
                  checked={autoIcon}
                  onChange={(e) => {
                    setAutoIcon(e.target.checked)
                    localStorage.setItem('aiss.toolbar.autoIcon', e.target.checked ? '1' : '0')
                    window.dispatchEvent(new Event('aiss-toolbar-auto-icon'))
                  }}
                />
                {t('settings.autoIcon')}
              </label>
            </section>
          ) : null}
          {active === 'terminal' ? <TerminalPrefsModal embedded onClose={() => undefined} onSaved={onTerminalSaved} /> : null}
          {active === 'connections' ? (
            <section>
              <h3>{t('settings.connections')}</h3>
              <label className="settings-row">
                <input type="checkbox" checked={showHostStatus} onChange={(e) => onShowHostStatus(e.target.checked)} />
                {t('settings.hostStatus')}
              </label>
              <p className="l7-muted">{t('settings.agent')}</p>
              <p className="l7-muted">{t('settings.keepalive')}</p>
            </section>
          ) : null}
          {active === 'ai' ? (
            <section>
              <h3>{t('settings.ai')}</h3>
              <AiConfigForm />
              <button type="button" onClick={onOpenMcp}>
                {t('menu.mcpGuide')}
              </button>
            </section>
          ) : null}
          {active === 'shortcuts' ? (
            <section>
              <h3>{t('settings.shortcuts')}</h3>
              <table className="shortcuts-table">
                <tbody>
                  {KEYMAP.map((row) => (
                    <tr key={row.id}>
                      <td>{locale === 'zh-CN' ? row.label.zh : row.label.en}</td>
                      <td>
                        <kbd>{row.keys}</kbd>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
          {active === 'security' ? (
            <section>
              <h3>{t('settings.security')}</h3>
              <label className="settings-row">
                <input type="checkbox" checked={auditOn} onChange={(e) => onAudit(e.target.checked)} />
                {t('settings.audit')}
              </label>
              <p className="l7-muted">{t('settings.dangerHint')}</p>
            </section>
          ) : null}
          {active === 'backup' ? (
            <section>
              <h3>{t('settings.backup')}</h3>
              <div className="settings-actions">
                <button type="button" onClick={onBackup}>
                  {t('settings.backupBtn')}
                </button>
                <button type="button" onClick={onCloudSync}>
                  {t('settings.cloud')}
                </button>
              </div>
            </section>
          ) : null}
          {active === 'about' ? (
            <section>
              <h3>{t('settings.about')}</h3>
              <p>
                {t('about.version')} <strong>{version ? `v${version}` : '…'}</strong>
              </p>
              <div className="settings-actions">
                <button type="button" onClick={onCheckUpdate}>
                  {t('menu.checkUpdate')}
                </button>
                <button type="button" onClick={onGithub}>
                  GitHub
                </button>
                <button type="button" onClick={onOpenUpdates}>
                  {t('app.tab.updates')}
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
