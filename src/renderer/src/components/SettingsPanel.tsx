import Select from './ui/Select'
import { useEffect, useMemo, useState } from 'react'
import type { StartupMode } from '@shared/startup-pref'
import { KEYMAP } from '@shared/keymap'
import {
  SETTINGS_ADVANCED,
  SETTINGS_PRIMARY,
  settingsSectionsForQuery,
  type SettingsSection
} from '@shared/settings-nav'
import {
  isHttpUrl,
  loadUpdateChannelPrefs,
  saveUpdateChannelPrefs,
  sourceLabel,
  type UpdateChannel
} from '@shared/update-channel'
import { setSnapshotKeep, setSnapshotsEnabled, snapshotKeep, snapshotsEnabled, SNAPSHOT_KEEP_OPTIONS } from '@shared/snapshots'
import { useI18n, type MessageKey } from '../lib/i18n'
import { applyUiTheme, loadUiThemeId, suggestedTerminalTheme, UI_THEME_OPTIONS, type UiThemeId } from '../lib/ui-themes'
import { loadAutoUpdate, saveAutoUpdate } from '../lib/update-check'
import { TOUR_DONE_KEY } from './WelcomeTour'
import type { TerminalPrefs } from '@shared/ipc'
import type { ProbePrefs } from '@shared/health-probe'
import AiConfigForm from './AiConfigForm'
import SafetyTierSettings from './SafetyTierSettings'
import HealthProbeFields from './HealthProbeFields'
import { loadLoopPrefs, saveLoopPrefs } from '@shared/alert-loop'
import TerminalPrefsModal from './TerminalPrefsModal'
import { confirmDialog } from '../lib/dialogs'
import { showToast } from '../lib/toast'
import AboutBlock from './AboutBlock'
import ReconnectPolicySection from './ReconnectPolicySection'
import EmptyState from './EmptyState'
import Icon from './Icon'
import { EMPTY_ICON_SIZE_COMPACT, EMPTY_ICON_STROKE } from './emptyIcons'
import PanelHeader from './ui/PanelHeader'

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
  restoreLayout: boolean
  onRestoreLayout: (on: boolean) => void
  showHostStatus: boolean
  onShowHostStatus: (on: boolean) => void
  auditOn: boolean
  onAudit: (on: boolean) => void
  version: string
  onBackup: () => void
  onCloudSync: () => void
  onCheckUpdate: () => void
  onWhatsNew: () => void
  checkingUpdate?: boolean
  isDev?: boolean
  onGithub: () => void
  onOpenMcp: () => void
  onOpenUpdates: () => void
  onTerminalSaved?: (prefs: TerminalPrefs) => void
  probePrefs: ProbePrefs
  onProbePrefs: (patch: Partial<ProbePrefs>) => void
  tagOptions?: string[]
  onOpenTemplates?: () => void
  onOpenGate?: () => void
  onOpenKnownHosts?: () => void
  settingsAnchor?: string | null
}

export default function SettingsPanel({
  section,
  onSection,
  startupMode,
  onStartupMode,
  restoreLayout,
  onRestoreLayout,
  showHostStatus,
  onShowHostStatus,
  auditOn,
  onAudit,
  version,
  onBackup,
  onCloudSync,
  onCheckUpdate,
  onWhatsNew,
  checkingUpdate = false,
  isDev = false,
  onGithub,
  onOpenMcp,
  onTerminalSaved,
  probePrefs,
  onProbePrefs,
  tagOptions,
  onOpenTemplates,
  onOpenGate,
  onOpenKnownHosts,
  settingsAnchor
}: Props) {
  const { t, locale, setLocale } = useI18n()
  const [q, setQ] = useState('')
  const [theme, setTheme] = useState<UiThemeId>(() => loadUiThemeId())
  const [autoUpdate, setAutoUpdate] = useState(() => loadAutoUpdate())
  const [tour, setTour] = useState(() => localStorage.getItem(TOUR_DONE_KEY) !== '1')
  const [autoIcon, setAutoIcon] = useState(() => localStorage.getItem('aiss.toolbar.autoIcon') !== '0')
  const [snapOn, setSnapOn] = useState(() => snapshotsEnabled())
  const [snapKeep, setSnapKeep] = useState(() => snapshotKeep())
  const [loopOn, setLoopOn] = useState(() => loadLoopPrefs().show)
  const [snapStats, setSnapStats] = useState({ files: 0, bytes: 0, count: 0 })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [channelEpoch, setChannelEpoch] = useState(0)
  const [channel, setChannel] = useState<UpdateChannel>(() => loadUpdateChannelPrefs().channel)
  const [mirror, setMirror] = useState(() => loadUpdateChannelPrefs().mirror)
  const [channelError, setChannelError] = useState<string | null>(null)
  useEffect(() => {
    if (section === 'ops' || section === 'files') setAdvancedOpen(true)
  }, [section])
  useEffect(() => {
    if (section !== 'files') return
    void window.aiss?.snapshots?.stats?.().then((s) => setSnapStats(s)).catch(() => undefined)
  }, [section, snapOn, snapKeep])

  const labels = useMemo(() => {
    const out = {} as Record<SettingsSection, string>
    for (const id of [...SETTINGS_PRIMARY, ...SETTINGS_ADVANCED]) out[id] = t(SECTION_KEY[id])
    return out
  }, [t])
  const visible = useMemo(() => settingsSectionsForQuery(q, labels), [q, labels])
  const active = visible.includes(section) ? section : visible[0]
  const showAdvanced = q.trim() ? visible.some((id) => SETTINGS_ADVANCED.includes(id)) : advancedOpen

  const saved = () => showToast(t('settings.saved'), { ms: 1500 })

  const applyChannel = (next: UpdateChannel, nextMirror = mirror) => {
    if (next === 'custom' && nextMirror.trim() && !isHttpUrl(nextMirror)) {
      setChannelError(t('n1.invalidUrl'))
      return
    }
    setChannelError(null)
    setChannel(next)
    saveUpdateChannelPrefs({ channel: next, mirror: nextMirror })
    setChannelEpoch((n) => n + 1)
    window.dispatchEvent(new Event('aiss-update-channel'))
    saved()
  }

  return (
    <div className="workspace-panel settings-root" data-testid="settings-panel" data-settings-layout="column">
      <PanelHeader
        title={t('settings.title')}
      />
      <div className="settings-shell">
        <nav className="settings-nav" aria-label={t('settings.title')}>
          <input
            className="settings-search"
            data-testid="settings-search"
            value={q}
            placeholder={t('settings.search')}
            aria-label={t('settings.search')}
            onChange={(e) => setQ(e.target.value)}
          />
          {SETTINGS_PRIMARY.filter((id) => visible.includes(id)).map((id) => (
            <button key={id} type="button" className={active === id ? 'is-on' : ''} data-section={id} onClick={() => onSection(id)}>
              {t(SECTION_KEY[id])}
            </button>
          ))}
          {visible.some((id) => SETTINGS_ADVANCED.includes(id)) ? (
            <button type="button" className="settings-advanced" data-testid="settings-advanced" aria-expanded={showAdvanced} onClick={() => setAdvancedOpen((v) => !v)}>
              {t('settings.advanced')}
            </button>
          ) : null}
          {showAdvanced
            ? SETTINGS_ADVANCED.filter((id) => visible.includes(id)).map((id) => (
                <button key={id} type="button" className={active === id ? 'is-on' : ''} data-section={id} onClick={() => onSection(id)}>
                  {t(SECTION_KEY[id])}
                </button>
              ))
            : null}
        </nav>
        <div
          className="settings-body"
          id={active ? `settings-${active}` : undefined}
          data-section={active || 'none'}
          data-settings-anchor={active || 'none'}
          data-hit={q.trim() ? '1' : '0'}
        >
          {visible.length === 0 ? (
            <EmptyState
              testId="settings-search-empty"
              icon={<Icon name="search" size={EMPTY_ICON_SIZE_COMPACT} strokeWidth={EMPTY_ICON_STROKE} />}
              title={t('settings.none', { q })}
              desc={t('settings.searchEmptyDesc')}
              primary={{ label: t('pf4.paletteClear'), onClick: () => setQ(''), testId: 'settings-search-clear' }}
            />
          ) : null}
          {active === 'general' ? (
            <section>
              <h3>{t('settings.general')}</h3>
              <label className="settings-row">
                <span>{t('settings.language')}</span>
                <Select
                  testId="settings-language"
                  ariaLabel={t('settings.language')}
                  value={locale}
                  onChange={(v) => {
                    setLocale(v === 'en' ? 'en' : 'zh-CN')
                    saved()
                  }}
                  options={[
                    { value: 'zh-CN', label: '中文' },
                    { value: 'en', label: 'English' }
                  ]}
                />
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
              <label className="settings-row" data-testid="restore-layout-row">
                <input
                  type="checkbox"
                  data-testid="restore-layout"
                  checked={restoreLayout}
                  onChange={(e) => onRestoreLayout(e.target.checked)}
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
                      const themeId = suggestedTerminalTheme(opt.id)
                      void window.aiss.terminal.setPrefs({ themeId }).then((p) => onTerminalSaved?.(p)).catch(() => {})
                      saved()
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
              <ReconnectPolicySection anchor={settingsAnchor} />
            </section>
          ) : null}
          {active === 'ops' ? (
            <section>
              <h3>{t('settings.ops')}</h3>
              <HealthProbeFields prefs={probePrefs} tagOptions={tagOptions} onChange={onProbePrefs} />
              <label className="settings-row">
                <input
                  type="checkbox"
                  data-testid="w7-settings"
                  checked={loopOn}
                  onChange={(e) => {
                    setLoopOn(e.target.checked)
                    saveLoopPrefs(e.target.checked)
                    window.dispatchEvent(new Event('aiss-loop-pref'))
                  }}
                />
                {t('w7.settings')}
              </label>
              <p className="l7-muted">{t('w7.settingsHint')}</p>
              {onOpenTemplates ? (
                <button type="button" data-testid="l2c-settings" onClick={onOpenTemplates}>
                  {t('l2c.seg.templates')}
                </button>
              ) : null}
            </section>
          ) : null}
          {active === 'ai' ? (
            <section>
              <h3>{t('settings.ai')}</h3>
              <SafetyTierSettings />
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
              <button
                type="button"
                className="link-btn"
                data-testid="help-open-palette"
                onClick={() => window.dispatchEvent(new CustomEvent('aiss-open-palette'))}
              >
                {t('help.searchPalette')}
              </button>
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
              <div className="settings-btn-row">
                {onOpenKnownHosts ? (
                  <button type="button" data-testid="settings-known-hosts" onClick={onOpenKnownHosts}>
                    {t('kh.openFromSettings')}
                  </button>
                ) : null}
                {onOpenGate ? (
                  <button type="button" data-testid="s2b-settings" onClick={onOpenGate}>
                    {t('s2b.tab')}
                  </button>
                ) : null}
              </div>
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
                <Select
                  testId="w3-snap-keep"
                  ariaLabel={t('w3.settingKeep')}
                  value={String(snapKeep)}
                  onChange={(v) => {
                    const n = Number(v)
                    setSnapKeep(n)
                    setSnapshotKeep(n)
                    void window.aiss.snapshots.setPrefs({ auto: snapOn, keep: n })
                  }}
                  options={SNAPSHOT_KEEP_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
                />
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
            <section data-testid="settings-about" className={q.trim() ? 'settings-hit' : undefined}>
              <h3>{t('settings.about')}</h3>
              <AboutBlock
                version={version}
                isDev={isDev}
                checking={checkingUpdate}
                channelEpoch={channelEpoch}
                onCheckUpdate={onCheckUpdate}
                onWhatsNew={onWhatsNew}
                onGithub={onGithub}
              />
              <fieldset className="settings-channel" data-testid="settings-update-channel">
                <legend>{t('n1.title')}</legend>
                <p className="l7-muted">{t('n1.hint')}</p>
                <div className="n1-sources" role="radiogroup" aria-label={t('n1.title')}>
                  {(
                    [
                      ['auto', 'n1.auto'],
                      ['gitee', 'n1.gitee'],
                      ['github', 'n1.github'],
                      ['custom', 'n1.custom']
                    ] as const
                  ).map(([id, key]) => (
                    <label key={id} className="n1-choice">
                      <input
                        type="radio"
                        name="settings-update-channel"
                        checked={channel === id}
                        onChange={() => applyChannel(id)}
                      />
                      {t(key)}
                    </label>
                  ))}
                </div>
                {channel === 'custom' ? (
                  <label className="n1-mirror">
                    {t('n1.mirror')}
                    <input
                      value={mirror}
                      placeholder={t('n1.mirrorPh')}
                      spellCheck={false}
                      aria-label={t('n1.mirror')}
                      onChange={(e) => setMirror(e.target.value)}
                      onBlur={() => applyChannel('custom', mirror)}
                    />
                  </label>
                ) : null}
                <p className="n1-current" data-testid="settings-update-source">
                  {t('n1.current', { source: sourceLabel(channel, locale) })}
                </p>
                {channelError ? <p className="st-error">{channelError}</p> : null}
              </fieldset>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}
