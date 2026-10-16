import { tg } from '../lib/i18n'
import Icon from './Icon'

type Props = {
  context?: string | null
  flash?: boolean
  onConfigure: () => void
}

/** UX-37: the only surface shown while AI has no API key. */
export default function AiConfigCard({ context, flash, onConfigure }: Props) {
  return (
    <div className={`ai-config-card${flash ? ' is-flash' : ''}`} data-testid="ai-config-card">
      {context ? (
        <div className="ai-config-context" data-testid="ai-config-context">
          {context}
        </div>
      ) : null}
      <div className="ai-config-mark" aria-hidden>
        <Icon name="sparkles" size={16} />
      </div>
      <div className="ai-config-title">{tg('ux37.can')}</div>
      <ul className="ai-config-list">
        <li>{tg('ux37.explain')}</li>
        <li>{tg('ux37.generate')}</li>
      </ul>
      <div className="ai-config-actions">
        <button type="button" className="primary" data-testid="ai-config-setup" onClick={onConfigure}>
          {tg('ux37.setup')}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            void window.aiss?.app?.openGithub?.()
          }}
        >
          {tg('ux37.learn')}
        </button>
      </div>
      <p className="ai-config-note">{tg('ux37.providers')}</p>
    </div>
  )
}
