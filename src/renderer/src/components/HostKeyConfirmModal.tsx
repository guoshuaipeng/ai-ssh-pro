import Modal from './Modal'
import type { SshHostKeyPromptEvent } from '@shared/ipc'

type Props = {
  prompt: SshHostKeyPromptEvent | null
  onRespond: (accept: boolean, alwaysTrust: boolean) => void
}

export default function HostKeyConfirmModal({ prompt, onRespond }: Props) {
  if (!prompt) return null

  const isChanged = prompt.reason === 'changed'
  const title = isChanged ? '主机密钥已变更' : '确认主机密钥'

  return (
    <Modal
      open
      title={title}
      onClose={() => onRespond(false, false)}
      width={520}
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => onRespond(false, false)}>
            拒绝
          </button>
          <button type="button" onClick={() => onRespond(true, false)}>
            仅本次连接
          </button>
          <button type="button" className="primary" onClick={() => onRespond(true, true)}>
            信任并继续
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
        {isChanged ? (
          <p style={{ margin: 0, color: 'var(--danger, #f85149)' }}>
            警告：该主机的 SSH 密钥与本地已保存的不一致，可能存在中间人攻击或服务器重装。请仔细核对指纹后再决定。
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            首次连接该主机。请确认下方指纹与服务器管理员提供的一致后再信任。
          </p>
        )}
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>主机</div>
          <code>
            {prompt.host}:{prompt.port}
          </code>
        </div>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>当前指纹</div>
          <code style={{ wordBreak: 'break-all' }}>{prompt.fingerprint}</code>
        </div>
        {prompt.previousFingerprint ? (
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>本地已保存指纹</div>
            <code style={{ wordBreak: 'break-all' }}>{prompt.previousFingerprint}</code>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
