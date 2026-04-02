import Modal from './Modal'
import AiConfigForm from './AiConfigForm'

type Props = {
  open: boolean
  onClose: () => void
}

export default function AiConfigModal({ open, onClose }: Props) {
  return (
    <Modal
      open={open}
      title="AI 配置"
      onClose={onClose}
      width={560}
      footer={
        <button type="button" onClick={onClose}>
          关闭
        </button>
      }
    >
      <AiConfigForm />
    </Modal>
  )
}
