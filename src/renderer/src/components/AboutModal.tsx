import { useEffect, useState } from 'react'
import Modal from './Modal'

type Props = {
  open: boolean
  onClose: () => void
}

export default function AboutModal({ open, onClose }: Props) {
  const [version, setVersion] = useState('')

  useEffect(() => {
    if (!open) return
    let cancelled = false
    void window.aiss.app
      .getVersion()
      .then((v) => {
        if (!cancelled) setVersion(v)
      })
      .catch(() => {
        if (!cancelled) setVersion('')
      })
    return () => {
      cancelled = true
    }
  }, [open])

  return (
    <Modal
      open={open}
      title="关于 AI-SSH-Pro"
      onClose={onClose}
      width={420}
      footer={
        <button type="button" className="primary" onClick={onClose}>
          确定
        </button>
      }
    >
      <div className="about-modal">
        <div className="about-modal-brand">AI-SSH-Pro</div>
        <p className="about-modal-desc">类 Xshell 的多会话 SSH 客户端，集成 AI 对话</p>
        <p className="about-modal-version">
          当前版本{' '}
          <strong>{version ? `v${version}` : '…'}</strong>
        </p>
        <button
          type="button"
          className="about-modal-link"
          onClick={() => {
            void window.aiss.app.openGithub().catch(() => {
              /* ignore */
            })
          }}
        >
          打开 GitHub 仓库
        </button>
      </div>
    </Modal>
  )
}
