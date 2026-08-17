import { useState } from 'react'

export type ConnectionConfigModalProps = {
  /** 默认「新建连接」；编辑已保存会话时可传入更明确的标题 */
  title?: string
  /** 默认「保存到列表」 */
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

export default function ConnectionConfigModal({
  title = '新建连接',
  saveProfileButtonLabel = '保存到列表',
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
  const [smartOpen, setSmartOpen] = useState(Boolean(smartPaste.trim()))
  const hasJump = Boolean(jumpHost.trim())
  const hasForward = Boolean(forwardLocalPort.trim() || forwardRemoteHost.trim() || forwardRemotePort.trim())

  return (
    <div className="workspace-panel workspace-panel--editor">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{title}</h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={onClose}>
            关闭
          </button>
          <button type="button" onClick={onSaveProfile}>
            {saveProfileButtonLabel}
          </button>
          <button type="button" className="primary" disabled={connecting} onClick={() => void onConnect()}>
            {connecting ? '连接中…' : '连接'}
          </button>
        </div>
      </div>

      <div className="workspace-panel-body workspace-panel-body--editor">
        <details
          className="ws-collapse"
          open={smartOpen}
          onToggle={(e) => setSmartOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>智能填表（粘贴工单 / ssh 命令后 AI 解析）</summary>
          <div className="ws-collapse-body">
            <textarea
              value={smartPaste}
              onChange={(e) => setSmartPaste(e.target.value)}
              placeholder={'例如：\n测试机 test_nlp01\n172.19.161.225 root\n端口 22'}
              rows={3}
              className="ws-textarea-compact"
            />
            <div className="ws-collapse-actions">
              <button
                type="button"
                className="primary"
                disabled={aiParsing || !smartPaste.trim()}
                onClick={() => void onParseAndFill()}
              >
                {aiParsing ? '解析中…' : 'AI 解析并填入'}
              </button>
            </div>
            {parseNotes ? <div className="ws-parse-notes">模型备注：{parseNotes}</div> : null}
          </div>
        </details>

        {error ? <div className="ws-error">{error}</div> : null}

        <div className="conn-layout">
          <section className="conn-card">
            <h3 className="conn-card-title">连接参数</h3>
            <p className="conn-card-hint">保存会写入本机列表（含密码/口令，勿在共享电脑使用）。</p>
            <div className="field-grid">
              <div className="field field--span2">
                <label>显示名</label>
                <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="可选" />
              </div>
              <div className="field field--span2">
                <label>主机</label>
                <input value={host} onChange={(e) => setHost(e.target.value)} placeholder="172.19.161.225" />
              </div>
              <div className="field">
                <label>端口</label>
                <input value={port} onChange={(e) => setPort(e.target.value)} />
              </div>
              <div className="field">
                <label>用户名</label>
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="root" />
              </div>
              <div className="field field--span2">
                <label>密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="与私钥二选一"
                  autoComplete="off"
                />
              </div>
              <div className="field field--span2">
                <label>私钥路径</label>
                <input
                  value={privateKeyPath}
                  onChange={(e) => setPrivateKeyPath(e.target.value)}
                  placeholder="C:\Users\me\.ssh\id_rsa"
                />
              </div>
              <div className="field field--span2">
                <label>私钥口令</label>
                <input
                  type="password"
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          </section>

          <div className="conn-side">
            <details className="ws-collapse conn-card" open={hasJump}>
              <summary>跳板机（可选）</summary>
              <div className="ws-collapse-body">
                <div className="field-grid">
                  <div className="field field--span2">
                    <label>跳板主机</label>
                    <input
                      value={jumpHost}
                      onChange={(e) => setJumpHost?.(e.target.value)}
                      placeholder="bastion.example.com"
                    />
                  </div>
                  <div className="field">
                    <label>端口</label>
                    <input value={jumpPort} onChange={(e) => setJumpPort?.(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>用户名</label>
                    <input value={jumpUsername} onChange={(e) => setJumpUsername?.(e.target.value)} />
                  </div>
                  <div className="field field--span2">
                    <label>密码</label>
                    <input
                      type="password"
                      value={jumpPassword}
                      onChange={(e) => setJumpPassword?.(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="field field--span2">
                    <label>私钥路径</label>
                    <input
                      value={jumpPrivateKeyPath}
                      onChange={(e) => setJumpPrivateKeyPath?.(e.target.value)}
                      placeholder="可选"
                    />
                  </div>
                  <div className="field field--span2">
                    <label>私钥口令</label>
                    <input
                      type="password"
                      value={jumpPassphrase}
                      onChange={(e) => setJumpPassphrase?.(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </div>
            </details>

            <details className="ws-collapse conn-card" open={hasForward}>
              <summary>本地端口转发（可选）</summary>
              <div className="ws-collapse-body">
                <p className="conn-card-hint">本机 127.0.0.1:本地端口 → 远端主机:端口</p>
                <div className="field-grid">
                  <div className="field">
                    <label>本地端口</label>
                    <input
                      value={forwardLocalPort}
                      onChange={(e) => setForwardLocalPort?.(e.target.value)}
                      placeholder="18080"
                    />
                  </div>
                  <div className="field">
                    <label>远端端口</label>
                    <input
                      value={forwardRemotePort}
                      onChange={(e) => setForwardRemotePort?.(e.target.value)}
                      placeholder="8080"
                    />
                  </div>
                  <div className="field field--span2">
                    <label>远端主机</label>
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
      </div>
    </div>
  )
}
