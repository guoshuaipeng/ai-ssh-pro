import { useState } from 'react'
import { useI18n } from '../lib/i18n'
import { showToast } from '../lib/toast'
import {
  isHttpUrl,
  loadUpdateChannelPrefs,
  saveUpdateChannelPrefs,
  sourceLabel,
  type UpdateChannel
} from '@shared/update-channel'

type Props = { onClose: () => void }

/** N1: Settings → Updates. A center tab, not a blocking dialog. */
export default function UpdateChannelPanel({ onClose }: Props) {
  const { t, locale } = useI18n()
  const initial = loadUpdateChannelPrefs()
  const [channel, setChannel] = useState<UpdateChannel>(initial.channel)
  const [mirror, setMirror] = useState(initial.mirror)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (channel === 'custom' && !isHttpUrl(mirror)) {
      setError(t('n1.invalidUrl'))
      return
    }
    saveUpdateChannelPrefs({ channel, mirror })
    setError(null)
    showToast(t('n1.saved'))
    onClose()
  }

  return (
    <div className="workspace-panel workspace-panel--settings" data-testid="update-channel">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">{t('n1.title')}</h2>
      </div>
      <div className="workspace-panel-body workspace-panel-body--settings">
        <div className="workspace-panel-inner workspace-panel-inner--settings">
          <p className="workspace-panel-hint">{t('n1.hint')}</p>
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
                <input type="radio" name="update-channel" checked={channel === id} onChange={() => setChannel(id)} />
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
                onChange={(e) => setMirror(e.target.value)}
                aria-label={t('n1.mirror')}
              />
            </label>
          ) : null}
          <p className="n1-current">{t('n1.current', { source: sourceLabel(channel, locale) })}</p>
          {error ? <p className="st-error">{error}</p> : null}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              {t('dlg.cancel')}
            </button>
            <button type="button" className="primary" onClick={save} data-testid="update-channel-save">
              {t('ui.25')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
