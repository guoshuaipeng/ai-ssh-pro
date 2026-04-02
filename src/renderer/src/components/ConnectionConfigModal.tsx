import Modal from './Modal'

export type ConnectionConfigModalProps = {
  open: boolean
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
}

export default function ConnectionConfigModal({
  open,
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
  onSaveProfile
}: ConnectionConfigModalProps) {
  return (
    <Modal
      open={open}
      title="连接配置"
      onClose={onClose}
      width={560}
      footer={
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button type="button" onClick={onClose}>
            关闭
          </button>
          <button type="button" onClick={onSaveProfile}>
            保存到列表
          </button>
          <button type="button" className="primary" disabled={connecting} onClick={() => void onConnect()}>
            {connecting ? '连接中…' : '连接'}
          </button>
        </div>
      }
    >
      <h3 className="modal-section-title">智能填表</h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.45 }}>
        粘贴工单、聊天记录、ssh 命令等，用「AI 配置」里的自定义拆分说明辅助解析，填入下方表单（不会自动连接）。
      </p>
      <div className="field" style={{ marginBottom: 8 }}>
        <textarea
          value={smartPaste}
          onChange={(e) => setSmartPaste(e.target.value)}
          placeholder="例如：&#10;测试机 test_nlp01&#10;172.19.161.225 root&#10;端口 22"
          rows={4}
          style={{ width: '100%', resize: 'vertical', minHeight: 88 }}
        />
      </div>
      <button
        type="button"
        className="primary"
        disabled={aiParsing || !smartPaste.trim()}
        onClick={() => void onParseAndFill()}
        style={{ marginBottom: 14 }}
      >
        {aiParsing ? '解析中…' : 'AI 解析并填入表单'}
      </button>
      {parseNotes && (
        <div
          style={{
            marginBottom: 16,
            padding: 8,
            fontSize: 11,
            color: 'var(--muted)',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            whiteSpace: 'pre-wrap'
          }}
        >
          模型备注：{parseNotes}
        </div>
      )}

      <h3 className="modal-section-title">连接参数</h3>
      {error && (
        <div style={{ color: 'var(--danger)', marginBottom: 10, fontSize: 12 }}>{error}</div>
      )}
      <div className="field">
        <label>显示名</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="可选" />
      </div>
      <div className="field">
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
      <div className="field">
        <label>密码</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="与私钥二选一"
          autoComplete="off"
        />
      </div>
      <div className="field">
        <label>私钥路径（本机）</label>
        <input
          value={privateKeyPath}
          onChange={(e) => setPrivateKeyPath(e.target.value)}
          placeholder="例如 C:\\Users\\me\\.ssh\\id_rsa"
        />
      </div>
      <div className="field">
        <label>私钥口令</label>
        <input
          type="password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
          autoComplete="off"
        />
      </div>
    </Modal>
  )
}
