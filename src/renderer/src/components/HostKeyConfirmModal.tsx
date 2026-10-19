import { useEffect, useState } from 'react'
import Modal from './Modal'
import { tg } from '../lib/i18n'
import type { SshHostKeyPromptEvent } from '@shared/ipc'

type Props = {
  prompt: SshHostKeyPromptEvent | null
  onRespond: (accept: boolean, alwaysTrust: boolean) => void
}

export default function HostKeyConfirmModal({ prompt, onRespond }: Props) {
  const [lookup, setLookup] = useState<{
    status: 'idle' | 'loading' | 'match' | 'mismatch' | 'empty' | 'error'
    detail?: string
  }>({ status: 'idle' })

  useEffect(() => {
    setLookup({ status: 'idle' })
  }, [prompt?.host, prompt?.port, prompt?.fingerprint])

  if (!prompt) return null

  const isChanged = prompt.reason === 'changed'
  const hopTitle = prompt.hopIndex ? `${tg('m2.hopN', { n: prompt.hopIndex })} · ` : ''
  const title = `${hopTitle}${isChanged ? tg('hk.changed') : tg('hk.confirm')}`

  const runLookup = async () => {
    setLookup({ status: 'loading' })
    try {
      const res = await window.aiss.knownHosts.lookupHost(prompt.host, prompt.port)
      if (res.missingTool) {
        setLookup({ status: 'error', detail: tg('kh.lookupNoTool') })
        return
      }
      if (!res.ok) {
        setLookup({ status: 'error', detail: res.error || tg('kh.lookupFail') })
        return
      }
      if (!res.matches.length) {
        setLookup({ status: 'empty', detail: tg('hk.lookupEmpty') })
        return
      }
      const hit = res.matches.find((m) => m.fingerprint === prompt.fingerprint)
      if (hit) {
        setLookup({
          status: 'match',
          detail: tg('hk.lookupMatch', { hashed: hit.hashed ? tg('hk.lookupWasHashed') : tg('hk.lookupWasPlain') })
        })
      } else {
        setLookup({
          status: 'mismatch',
          detail: tg('hk.lookupMismatch', { fp: res.matches[0]!.fingerprint })
        })
      }
    } catch (e) {
      setLookup({ status: 'error', detail: e instanceof Error ? e.message : String(e) })
    }
  }

  return (
    <Modal
      open
      title={title}
      onClose={() => onRespond(false, false)}
      width={520}
      footer={
        <div className="hk-footer" data-testid="hk-footer">
          <p className="hk-footer-hint">{isChanged ? tg('hk.hintChanged') : tg('hk.hintFirst')}</p>
          <div className="hk-footer-actions">
            <button type="button" data-testid="hk-reject" onClick={() => onRespond(false, false)}>
              {tg('hk.reject')}
            </button>
            <button type="button" data-testid="hk-once" onClick={() => onRespond(true, false)}>
              {tg('hk.once')}
            </button>
            <button
              type="button"
              className={isChanged ? 'danger' : 'primary'}
              data-testid="hk-trust"
              onClick={() => onRespond(true, true)}
            >
              {isChanged ? tg('hk.trustChanged') : tg('hk.trust')}
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
        {isChanged ? (
          <p style={{ margin: 0, color: 'var(--color-danger)' }} role="alert" data-testid="hk-warn">
            {tg('hk.warn')}
          </p>
        ) : (
          <p style={{ margin: 0 }}>{tg('hk.first')}</p>
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
        <div className="hk-lookup-box" data-testid="hk-lookup-box">
          <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{tg('hk.lookupLead')}</p>
          <button
            type="button"
            data-testid="hk-lookup-run"
            disabled={lookup.status === 'loading'}
            onClick={() => void runLookup()}
            style={{ marginTop: 6 }}
          >
            {lookup.status === 'loading' ? tg('kh.lookupBusy') : tg('hk.lookupRun')}
          </button>
          {lookup.status === 'match' ? (
            <p style={{ margin: '6px 0 0', color: 'var(--accent)' }} data-testid="hk-lookup-match">
              {lookup.detail}
            </p>
          ) : null}
          {lookup.status === 'mismatch' || lookup.status === 'empty' || lookup.status === 'error' ? (
            <p style={{ margin: '6px 0 0', color: 'var(--muted)' }} data-testid="hk-lookup-note">
              {lookup.detail}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  )
}
