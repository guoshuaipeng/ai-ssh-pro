import type { ShortcutGroup } from '@shared/workspace-features'
import { KEYMAP } from '@shared/keymap'
import { useI18n, type MessageKey } from '../lib/i18n'
import Modal from './Modal'

type Props = { open: boolean; onClose: () => void }

const GROUPS: ShortcutGroup[] = ['general', 'session', 'terminal', 'view']

export default function ShortcutsModal({ open, onClose }: Props) {
  const { t, locale } = useI18n()
  return (
    <Modal open={open} title={t('shortcuts.title')} onClose={onClose} width={520}>
      <div className="shortcuts-panel">
        {GROUPS.map((g) => (
          <section key={g}>
            <h3 className="modal-section-title">{t(`shortcuts.group.${g}` as MessageKey)}</h3>
            <table className="shortcuts-table">
              <tbody>
                {KEYMAP.filter((s) => s.group === g).map((s) => (
                  <tr key={s.id}>
                    <td>{locale === 'zh-CN' ? s.label.zh : s.label.en}</td>
                    <td>
                      {s.keys.split('+').map((k, i) => (
                        <span key={i}>
                          {i > 0 ? ' + ' : ''}
                          <kbd>{k}</kbd>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
        <p className="shortcuts-hint">{t('shortcuts.hint')}</p>
      </div>
    </Modal>
  )
}
