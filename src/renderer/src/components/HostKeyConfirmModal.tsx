import Modal from './Modal'
import { tg } from '../lib/i18n'
import type { SshHostKeyPromptEvent } from '@shared/ipc'

type Props = {
  prompt: SshHostKeyPromptEvent | null
  onRespond: (accept: boolean, alwaysTrust: boolean) => void
}

export default function HostKeyConfirmModal({ prompt, onRespond }: Props) {
  if (!prompt) return null

  const isChanged = prompt.reason === 'changed'
  const hopTitle = prompt.hopIndex ? `${tg('m2.hopN', { n: prompt.hopIndex })} · ` : ''
  const title = `${hopTitle}${isChanged ? tg('hk.changed') : tg('hk.confirm')}`

  return (
    <Modal
      open
      title={title}
      onClose={() => onRespond(false, false)}
      width={520}
      footer={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => onRespond(false, false)}>
            {tg('hk.reject')}
          </button>
          <button type="button" onClick={() => onRespond(true, false)}>
            {tg('hk.once')}
          </button>
          <button type="button" className="primary" onClick={() => onRespond(true, true)}>
            {tg('hk.trust')}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
        {isChanged ? (
          <p style={{ margin: 0, color: 'var(--color-danger)' }}>
            {tg('hk.warn')}
          </p>
        ) : (
          <p style={{ margin: 0 }}>
            {tg('hk.first')}
          </p>
        )}
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{tg('hk.host')}</div>
          <code>
            {prompt.hopIndex ? `${tg('m2.hopN', { n: prompt.hopIndex })}/${prompt.hopTotal ?? ''} ` : ''}
            {prompt.host}:{prompt.port}
          </code>
        </div>
        <div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{tg('hk.fp')}</div>
          <code style={{ wordBreak: 'break-all' }}>{prompt.fingerprint}</code>
        </div>
        {prompt.previousFingerprint ? (
          <div>
            <div style={{ color: 'var(--muted)', fontSize: 12 }}>{tg('hk.savedFp')}</div>
            <code style={{ wordBreak: 'break-all' }}>{prompt.previousFingerprint}</code>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
