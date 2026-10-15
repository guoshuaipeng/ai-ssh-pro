import { useEffect, useMemo, useState } from 'react'
import type { StartupMode } from '@shared/startup-pref'
import { KEYMAP } from '@shared/keymap'
import { SETTINGS_SECTIONS, type SettingsSection } from '@shared/settings-nav'
import { setSnapshotKeep, setSnapshotsEnabled, snapshotKeep, snapshotsEnabled, SNAPSHOT_KEEP_OPTIONS } from '@shared/snapshots'
import { useI18n, type MessageKey } from '../lib/i18n'
import { applyUiTheme, loadUiThemeId, UI_THEME_OPTIONS, type UiThemeId } from '../lib/ui-themes'
import { loadAutoUpdate, saveAutoUpdate } from '../lib/update-check'
import { TOUR_DONE_KEY } from './WelcomeTour'
import type { TerminalPrefs } from '@shared/ipc'
import type { ProbePrefs } from '@shared/health-probe'
import AiConfigForm from './AiConfigForm'
import HealthProbeFields from './HealthProbeFields'
import TerminalPrefsModal from './TerminalPrefsModal'
import { confirmDialog } from '../lib/dialogs'

const SECTION_KEY: Record<SettingsSection, MessageKey> = {
  general: 'settings.general',
  appearance: 'settings.appearance',
  terminal: 'settings.terminal',
  connections: 'settings.connections',
  ops: 'settings.ops',
  ai: 'settings.ai',
  shortcuts: 'settings.shortcuts',
  security: 'settings.security',
  files: 'settings.files',
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
  probePrefs: ProbePrefs
  onProbePrefs: (patch: Partial<ProbePrefs>) => void
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
  onTerminalSaved,
  probePrefs,
  onProbePrefs
}: Props) {
  const { t, locale, setLocale } = useI18n()
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState<UiThemeId>(() => loadUiThemeId())
  const [autoUpdate, setAutoUpdate] = useState(() => loadAutoUpdate())
  const [tour, setTour] = useState(() => localStorage.getItem(TOUR_DONE_KEY) !== '1')
  const [autoIcon, setAutoIcon] = useState(() => localStorage.getItem('aiss.toolbar.autoIcon') !== '0')
  const [snapOn, setSnapOn] = useState(() => snapshotsEnabled())
  const [snapKeep, setSnapKeep] = useState(() => snapshotKeep())
  const [snapStats, setSnapStats] = useState({ files: 0, bytes: 0, count: 0 })
  useEffect(() => {
    if (section !== 'files') return
    void window.aiss?.snapshots?.stats?.().then((s) => setSnapStats(s)).catch(() => undefined)
  }, [section, snapOn, snapKeep])

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
          {active === 'ops' ? (
            <section>
              <h3>{t('settings.ops')}</h3>
              <HealthProbeFields prefs={probePrefs} onChange={onProbePrefs} />
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
          {active === 'files' ? (
            <section data-testid="settings-files">
              <h3>{t('settings.files')}</h3>
              <label className="settings-row">
                <input
                  type="checkbox"
                  checked={snapOn}
                  onChange={(e) => {
                    setSnapOn(e.target.checked)
                    setSnapshotsEnabled(e.target.checked)
                    void window.aiss.snapshots.setPrefs({ auto: e.target.checked, keep: snapKeep })
                  }}
                />
                {t('w3.settingAuto')}
              </label>
              <label className="settings-row">
                <span>{t('w3.settingKeep')}</span>
                <select
                  value={snapKeep}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setSnapKeep(n)
                    setSnapshotKeep(n)
                    void window.aiss.snapshots.setPrefs({ auto: snapOn, keep: n })
                  }}
                >
                  {SNAPSHOT_KEEP_OPTIONS.map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </label>
              <p className="l7-muted">{t('w3.settingUsed', { size: snapStats.bytes < 1024 * 1024 ? `${Math.ceil(snapStats.bytes / 1024)} KB` : `${(snapStats.bytes / (1024 * 1024)).toFixed(1)} MB` })}</p>
              <p className="l7-muted">{t('w3.filesN', { n: snapStats.files, size: String(snapStats.count) })}</p>
              <div className="settings-actions">
                <button type="button" onClick={() => void window.aiss.snapshots.openDir()}>{t('w3.openDir')}</button>
                <button
                  type="button"
                  onClick={() => {
                    void confirmDialog({
                      title: t('w3.clearAll'),
                      body: t('w3.clearAllConfirm', { n: snapStats.count, size: `${snapStats.bytes}` }),
                      confirmText: t('w3.clearAllBtn', { n: snapStats.count }),
                      danger: true
                    }).then((ok) => {
                      if (!ok) return
                      void window.aiss.snapshots.clear().then(() => setSnapStats({ files: 0, bytes: 0, count: 0 }))
                    })
                  }}
                >
                  {t('w3.clearAll')}
                </button>
              </div>
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
