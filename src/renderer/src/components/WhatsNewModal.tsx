import { useI18n, type MessageKey } from '../lib/i18n'
import Modal from './Modal'
import type { TitlebarMenuAction } from './TitlebarMenus'

type Props = {
  open: boolean
  version: string
  onClose: () => void
  onAction: (action: TitlebarMenuAction) => void
}

/** Highlights of the current release; each row has a "Try it" button that opens the feature. */
export const WHATS_NEW: ReadonlyArray<{ key: string; action?: TitlebarMenuAction; keys?: string }> = [
  { key: 'palette', action: 'commandPalette', keys: 'Ctrl+Shift+P / Ctrl+K' },
  { key: 'toolbar' },
  { key: 'monitor', action: 'resourceMonitor', keys: 'Ctrl+Shift+M' },
  { key: 'toolbox', action: 'serverTools', keys: 'Ctrl+Shift+T' },
  { key: 'forward', action: 'portForward', keys: 'Ctrl+Shift+O' },
  { key: 'backup', action: 'backup' },
  { key: 'split', action: 'toggleSplit' }
]

export default function WhatsNewModal({ open, version, onClose, onAction }: Props) {
  const { t } = useI18n()
  return (
    <Modal open={open} title={t('wn.title', { version })} onClose={onClose} width={600}>
      <div className="wn-panel">
        <p className="wn-intro">{t('wn.intro')}</p>
        <ul className="wn-list">
          {WHATS_NEW.map((it) => (
            <li key={it.key} className="wn-item">
              <div className="wn-text">
                <strong>{t(`wn.${it.key}.title` as MessageKey)}</strong>
                {it.keys ? <kbd className="wn-kbd">{it.keys}</kbd> : null}
                <span>{t(`wn.${it.key}.desc` as MessageKey)}</span>
              </div>
              {it.action ? (
                <button
                  type="button"
                  className="ai-fill-cmd-btn"
                  onClick={() => {
                    onClose()
                    window.setTimeout(() => onAction(it.action!), 0)
                  }}
                >
                  {t('wn.try')}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="wn-foot">
          <span>{t('wn.later')}</span>
          <button type="button" className="primary" onClick={onClose}>
            {t('wn.ok')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
