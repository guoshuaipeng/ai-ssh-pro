import { useEffect, useState } from 'react'
import { certCardState, detectKeyMaterial, parseCertificate, siblingCertPath, skNeedsAgent } from '@shared/ssh-cert'
import { tg } from '../lib/i18n'

type Props = {
  keyPath: string
  certificatePath: string
  username: string
  authMode: 'password' | 'key' | 'agent'
  onSwitchAgent?: () => void
}

/** S3: certificate card and the sk-ed25519 → agent gate. */
export default function CertCard({ keyPath, certificatePath, username, authMode, onSwitchAgent }: Props) {
  const [text, setText] = useState('')
  const [keyText, setKeyText] = useState('')

  useEffect(() => {
    const path = certificatePath.trim() || (keyPath.trim() ? siblingCertPath(keyPath.trim()) : '')
    if (!path || !window.aiss?.localFs?.readText) {
      setText('')
      return
    }
    let stop = false
    void window.aiss.localFs
      .readText(path, 200_000)
      .then((r) => {
        if (!stop) setText(r?.content || '')
      })
      .catch(() => {
        if (!stop) setText('')
      })
    return () => {
      stop = true
    }
  }, [certificatePath, keyPath])

  useEffect(() => {
    const path = keyPath.trim()
    if (!path || !window.aiss?.localFs?.readText) {
      setKeyText('')
      return
    }
    let stop = false
    void window.aiss.localFs
      .readText(path, 64_000)
      .then((r) => {
        if (!stop) setKeyText(r?.content || '')
      })
      .catch(() => {
        if (!stop) setKeyText('')
      })
    return () => {
      stop = true
    }
  }, [keyPath])

  const kind = keyText ? detectKeyMaterial(keyText) : 'unknown'
  const sk = skNeedsAgent(kind, authMode)
  const info = text ? parseCertificate(text, username) : null
  const card = info ? certCardState(info, username) : null

  return (
    <div className="cert-card" data-testid="cert-card">
      {sk ? (
        <p className="jump-issue">
          {tg('m2.skNeedsAgent')}{' '}
          {onSwitchAgent ? (
            <button type="button" onClick={onSwitchAgent}>
              {tg('m2.switchAgent')}
            </button>
          ) : null}
        </p>
      ) : null}
      {card?.code === 'ok' ? <p className="l4-hint">{tg('m2.certFound', { date: card.date, user: card.user || '—' })}</p> : null}
      {card?.code === 'soon' ? <p className="jump-issue">{tg('m2.certSoon', { n: card.days })}</p> : null}
      {card?.code === 'expired' ? <p className="jump-issue">{tg('m2.certExpired', { date: card.date })}</p> : null}
      {card?.code === 'none' || !card ? <p className="l4-hint">{tg('m2.certNone')}</p> : null}
    </div>
  )
}
