import { useEffect, useRef, useState } from 'react'
import { PRODUCT_NAME } from '@shared/product'
import { GITEE_REPO_URL, GITHUB_REPO_URL, effectiveChannelLabel, loadUpdateChannelPrefs } from '@shared/update-channel'
import { useI18n } from '../lib/i18n'
import BrandMark from './BrandMark'

type Props = {
  version: string
  isDev?: boolean
  checking?: boolean
  onCheckUpdate: () => void
  onWhatsNew: () => void
  onGithub: () => void
  /** Bumps when the settings channel radios change so this block re-reads storage. */
  channelEpoch?: number
}

/** PF-2: one about narrative for Help → About and Settings → About. */
export default function AboutBlock({ version, isDev = false, checking = false, onCheckUpdate, onWhatsNew, onGithub, channelEpoch = 0 }: Props) {
  const { t, locale } = useI18n()
  const checkRef = useRef<HTMLButtonElement>(null)
  const [channel, setChannel] = useState(() => effectiveChannelLabel(locale))
  useEffect(() => {
    checkRef.current?.focus()
  }, [])
  const versionText = version ? `v${version}${isDev ? '-dev' : ''}` : '…'

  useEffect(() => {
    setChannel(effectiveChannelLabel(locale))
  }, [locale, channelEpoch])

  useEffect(() => {
    const onStorage = () => setChannel(effectiveChannelLabel(locale))
    window.addEventListener('aiss-update-channel', onStorage)
    return () => window.removeEventListener('aiss-update-channel', onStorage)
  }, [locale])

  return (
    <div className="about-block" data-testid="about-block" data-channel={loadUpdateChannelPrefs().channel}>
      <div className="about-brand-row">
        <BrandMark size={32} />
        <div className="about-name">{PRODUCT_NAME}</div>
      </div>
      <p className="about-version-line">
        <button type="button" className="about-version-btn" data-testid="about-version" onClick={onWhatsNew}>
          {t('about.versionLine', { v: versionText, channel })}
        </button>
      </p>
      <p className="about-tagline">{t('brand.tagline')}</p>
      <div className="about-actions">
        <button
          type="button"
          className="primary"
          ref={checkRef}
          data-testid="about-check"
          disabled={checking}
          aria-busy={checking}
          onClick={onCheckUpdate}
        >
          {checking ? t('upd.checking') : t('about.check')}
        </button>
        <button type="button" className="secondary" data-testid="about-notes" onClick={onWhatsNew}>
          {t('about.whatsNew')}
        </button>
        <button type="button" className="secondary" data-testid="about-github" onClick={onGithub}>
          GitHub
        </button>
      </div>
      <p className="about-sources">
        <button
          type="button"
          className="about-link"
          data-testid="about-gitee"
          onClick={() => {
            void window.aiss.app.openExternal(GITEE_REPO_URL).catch(() => undefined)
          }}
        >
          {t('about.gitee')}
        </button>
      </p>
      <p className="about-license">
        {t('about.license')}
        {' · '}
        <button
          type="button"
          className="about-link"
          data-testid="about-license"
          onClick={() => {
            void window.aiss.app.openExternal(`${GITHUB_REPO_URL}/blob/master/LICENSE`).catch(() => undefined)
          }}
        >
          {t('about.viewLicense')}
        </button>
      </p>
      <p className="about-local">{t('about.local')}</p>
    </div>
  )
}
