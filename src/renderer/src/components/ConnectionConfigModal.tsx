import { useMemo, useState } from 'react'
import { tg } from '../lib/i18n'

export type ConnectionConfigModalProps = {
  /** 默认「新建连接」；编辑已保存会话时可传入更明确的标题 */
  title?: string
  /** 默认「保存」 */
  saveProfileButtonLabel?: string
  onClose: () => void
  error: string | null
  host: string
  setHost: (v: string) => void
  port: string
  setPort: (v: string) => void
  username: string
  setUsername: (v: string) => void
  password: string
  setPassword: (v: string) => void
  privateKeyPath: string
  setPrivateKeyPath: (v: string) => void
  passphrase: string
  setPassphrase: (v: string) => void
  label: string
  setLabel: (v: string) => void
  smartPaste: string
  setSmartPaste: (v: string) => void
  parseNotes: string | null
  aiParsing: boolean
  connecting: boolean
  onParseAndFill: () => void | Promise<void>
  onConnect: () => void | Promise<void>
  onSaveProfile: () => void
  jumpHost?: string
  setJumpHost?: (v: string) => void
  jumpPort?: string
  setJumpPort?: (v: string) => void
  jumpUsername?: string
  setJumpUsername?: (v: string) => void
  jumpPassword?: string
  setJumpPassword?: (v: string) => void
  jumpPrivateKeyPath?: string
  setJumpPrivateKeyPath?: (v: string) => void
  jumpPassphrase?: string
  setJumpPassphrase?: (v: string) => void
  forwardLocalPort?: string
  setForwardLocalPort?: (v: string) => void
  forwardRemoteHost?: string
  setForwardRemoteHost?: (v: string) => void
  forwardRemotePort?: string
  setForwardRemotePort?: (v: string) => void
}

/** UX-25: documentation-range placeholder only */
export const HOST_PLACEHOLDER = '192.0.2.10'

export default function ConnectionConfigModal({
  title = tg('ui.30'),
  saveProfileButtonLabel = tg('conn.save'),
  onClose,
  error,
  host,
  setHost,
  port,
  setPort,
  username,
  setUsername,
  password,
  setPassword,
  privateKeyPath,
  setPrivateKeyPath,
  passphrase,
  setPassphrase,
  label,
  setLabel,
  smartPaste,
  setSmartPaste,
  parseNotes,
  aiParsing,
  connecting,
  onParseAndFill,
  onConnect,
  onSaveProfile,
  jumpHost = '',
  setJumpHost,
  jumpPort = '22',
  setJumpPort,
  jumpUsername = '',
  setJumpUsername,
  jumpPassword = '',
  setJumpPassword,
  jumpPrivateKeyPath = '',
  setJumpPrivateKeyPath,
  jumpPassphrase = '',
  setJumpPassphrase,
  forwardLocalPort = '',
  setForwardLocalPort,
  forwardRemoteHost = '',
  setForwardRemoteHost,
  forwardRemotePort = '',
  setForwardRemotePort
}: ConnectionConfigModalProps) {
  const initialAuth: 'password' | 'key' = privateKeyPath.trim() ? 'key' : 'password'
  const [authMode, setAuthMode] = useState<'password' | 'key'>(initialAuth)
  const advancedOpenDefault = Boolean(
    jumpHost.trim() ||
      forwardLocalPort.trim() ||
      forwardRemoteHost.trim() ||
      forwardRemotePort.trim()
  )
  const [advancedOpen, setAdvancedOpen] = useState(advancedOpenDefault)

  return (
    <div className="workspace-panel workspace-panel--editor conn-form-ux25">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{title}</h2>
      </div>

      <div className="workspace-panel-body workspace-panel-body--editor conn-form-body">
        {error ? <div className="ws-error">{error}</div> : null}

        <div className="conn-form-col">
          <section className="conn-card conn-smart-fill">
            <h3 className="conn-card-title">{tg('ui.34')}</h3>
            <textarea
              value={smartPaste}
              onChange={(e) => setSmartPaste(e.target.value)}
              placeholder={tg('ui.35')}
              rows={3}
              className="ws-textarea-compact"
            />
            <div className="ws-collapse-actions" style={{ marginTop: 8 }}>
              <button
                type="button"
                className="primary"
                disabled={aiParsing || !smartPaste.trim()}
                onClick={() => void onParseAndFill()}
              >
                {aiParsing ? tg('ui.36') : tg('ui.37')}
              </button>
            </div>
            {parseNotes ? <div className="ws-parse-notes">{tg('ui.38')}{parseNotes}</div> : null}
          </section>

          <section className="conn-card">
            <h3 className="conn-card-title">{tg('conn.groupBasic')}</h3>
            <div className="field-grid field-grid--single">
              <div className="field">
                <label>{tg('ui.41')}</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tg('ui.42')} />
              </div>
              <div className="field">
                <label>{tg('ui.43')}</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder={HOST_PLACEHOLDER} />
              </div>
              <div className="field-row2">
                <div className="field">
                  <label>{tg('ui.44')}</label>
                  <input value={port} onChange={(e) => setPort(e.target.value)} />
                </div>
                <div className="field">
                  <label>{tg('ui.45')}</label>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" />
                </div>
              </div>
            </div>
          </section>

          <section className="conn-card">
            <h3 className="conn-card-title">{tg('conn.groupAuth')}</h3>
            <div className="conn-auth-toggle" role="radiogroup" aria-label={tg('conn.groupAuth')}>
              <label className={authMode === 'password' ? 'active' : ''}>
                <input
                  type="radio"
                  name="conn-auth"
                  checked={authMode === 'password'}
                  onChange={() => setAuthMode('password')}
                />
                {tg('conn.authPassword')}
              </label>
              <label className={authMode === 'key' ? 'active' : ''}>
                <input type="radio" name="conn-auth" checked={authMode === 'key'} onChange={() => setAuthMode('key')} />
                {tg('conn.authKey')}
              </label>
            </div>
            <div className="field-grid field-grid--single">
              {authMode === 'password' ? (
                <div className="field">
                  <label>{tg('ui.46')}</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={tg('ui.47')}
                    autoComplete="off"
                  />
                </div>
              ) : (
                <>
                  <div className="field">
                    <label>{tg('ui.48')}</label>
                    <input
                      value={privateKeyPath}
                      onChange={(e) => setPrivateKeyPath(e.target.value)}
                      placeholder={'C:\\Users\\me\\.ssh\\id_rsa'}
                    />
                  </div>
                  <div className="field">
                    <label>{tg('ui.49')}</label>
                    <input
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </>
              )}
            </div>
          </section>

          <details
            className="ws-collapse conn-card"
            open={advancedOpen}
            onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary>{tg('conn.groupAdvanced')}</summary>
            <div className="ws-collapse-body">
              <h4 className="conn-subhead">{tg('ui.50')}</h4>
              <div className="field-grid field-grid--single">
                <div className="field">
                  <label>{tg('ui.51')}</label>
                  <input
                    value={jumpHost}
                    onChange={(e) => setJumpHost?.(e.target.value)}
                    placeholder="bastion.example.com"
                  />
                </div>
                <div className="field-row2">
                  <div className="field">
                    <label>{tg('ui.44')}</label>
                    <input value={jumpPort} onChange={(e) => setJumpPort?.(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>{tg('ui.45')}</label>
                    <input value={jumpUsername} onChange={(e) => setJumpUsername?.(e.target.value)} />
                  </div>
                </div>
                <div className="field">
                  <label>{tg('ui.46')}</label>
                  <input
                    type="password"
                    value={jumpPassword}
                    onChange={(e) => setJumpPassword?.(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="field">
                  <label>{tg('ui.48')}</label>
                  <input
                    value={jumpPrivateKeyPath}
                    onChange={(e) => setJumpPrivateKeyPath?.(e.target.value)}
                    placeholder={tg('ui.42')}
                  />
                </div>
                <div className="field">
                  <label>{tg('ui.49')}</label>
                  <input
                    type="password"
                    value={jumpPassphrase}
                    onChange={(e) => setJumpPassphrase?.(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              </div>

              <h4 className="conn-subhead">{tg('ui.52')}</h4>
              <p className="conn-card-hint">{tg('ui.53')}</p>
              <div className="field-grid field-grid--single">
                <div className="field-row2">
                  <div className="field">
                    <label>{tg('ui.54')}</label>
                    <input
                      value={forwardLocalPort}
                      onChange={(e) => setForwardLocalPort?.(e.target.value)}
                      placeholder="18080"
                    />
                  </div>
                  <div className="field">
                    <label>{tg('ui.55')}</label>
                    <input
                      value={forwardRemotePort}
                      onChange={(e) => setForwardRemotePort?.(e.target.value)}
                      placeholder="8080"
                    />
                  </div>
                </div>
                <div className="field">
                  <label>{tg('ui.56')}</label>
                  <input
                    value={forwardRemoteHost}
                    onChange={(e) => setForwardRemoteHost?.(e.target.value)}
                    placeholder="127.0.0.1"
                  />
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="conn-form-footer">
        <button type="button" onClick={onClose}>
          {tg('conn.cancel')}
        </button>
        <button type="button" onClick={onSaveProfile}>
          {saveProfileButtonLabel}
        </button>
        <button type="button" className="primary" disabled={connecting} onClick={() => void onConnect()}>
          {connecting ? tg('ui.32') : tg('conn.saveConnect')}
        </button>
      </div>
    </div>
  )
}
