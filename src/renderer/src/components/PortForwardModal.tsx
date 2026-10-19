import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ActiveForward } from '@shared/ipc'
import { useI18n } from '../lib/i18n'
import { friendlyErrorMessage } from '../lib/friendly-error'
import Modal from './Modal'
import type { BatchSessionOption } from './BatchExecuteModal'
import EmptyState from './EmptyState'
import ErrorNotice from './ErrorNotice'
import Button from './ui/Button'

type Props = {
  open: boolean
  sessions: BatchSessionOption[]
  activeSessionId: string | null
  /** UX-14: render inside a center tab */
  embedded?: boolean
  onClose: () => void
  /** PF-4: no live session — open the host picker instead of a native error. */
  onPickHost?: () => void
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

/** Lists live local port forwards of connected SSH sessions; add / stop at runtime. */
export default function PortForwardModal({ open, sessions, activeSessionId, onClose, embedded, onPickHost }: Props) {
  const { t, locale } = useI18n()
  const [rows, setRows] = useState<ActiveForward[]>([])
  const [sessionId, setSessionId] = useState('')
  const [localPort, setLocalPort] = useState('')
  const [remoteHost, setRemoteHost] = useState('127.0.0.1')
  const [remotePort, setRemotePort] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)

  const titleOf = useMemo(() => new Map(sessions.map((s) => [s.sessionId, s.title])), [sessions])

  const reload = useCallback(async () => {
    try {
      setRows(await window.aiss.workspace.forwards.list())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setError(null)
    setSessionId((cur) =>
      cur && sessions.some((s) => s.sessionId === cur)
        ? cur
        : sessions.find((s) => s.sessionId === activeSessionId)?.sessionId ?? sessions[0]?.sessionId ?? ''
    )
    void reload()
    const timer = setInterval(() => void reload(), 1000)
    return () => clearInterval(timer)
  }, [open, sessions, activeSessionId, reload])

  const add = async () => {
    setError(null)
    if (!sessionId) {
      setError(t('pf.needSession'))
      return
    }
    setBusy(true)
    try {
      await window.aiss.workspace.forwards.add({
        sessionId,
        localPort: localPort.trim() === '' ? 0 : Number(localPort),
        remoteHost: remoteHost.trim() || '127.0.0.1',
        remotePort: Number(remotePort)
      })
      setLocalPort('')
      setRemotePort('')
      await reload()
    } catch (e) {
      setError(friendlyErrorMessage(e, locale === 'en' ? 'en' : 'zh-CN'))
    } finally {
      setBusy(false)
    }
  }

  const stop = async (id: string) => {
    await window.aiss.workspace.forwards.remove(id)
    await reload()
  }

  const copy = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr)
      setCopied(addr)
      setTimeout(() => setCopied(null), 1200)
    } catch {
      /* ignore */
    }
  }

  return (
    <Modal open={open || !!embedded} title={t('pf.title')} onClose={onClose} width={760} embedded={embedded} testId="port-forward-panel">
      <div className="pf-panel">
        <p className="pf-hint">{t('pf.hint')}</p>
        {sessions.length === 0 && rows.length > 0 ? <p className="pf-empty">{t('pf.noSessions')}</p> : null}
        <div className="pf-form">
          <label>
            {t('pf.session')}
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)} disabled={!sessions.length}>
              {sessions.map((s) => (
                <option key={s.sessionId} value={s.sessionId}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('pf.localPort')}
            <input value={localPort} placeholder={t('pf.auto')} onChange={(e) => setLocalPort(e.target.value)} inputMode="numeric" />
          </label>
          <label>
            {t('pf.remoteHost')}
            <input value={remoteHost} onChange={(e) => setRemoteHost(e.target.value)} />
          </label>
          <label>
            {t('pf.remotePort')}
            <input value={remotePort} onChange={(e) => setRemotePort(e.target.value)} inputMode="numeric" />
          </label>
          <Button variant="primary" disabled={busy || !sessions.length} onClick={() => void add()}>
            {t('pf.add')}
          </Button>
        </div>
        {error ? (
          <ErrorNotice
            testId="pf-error"
            message={error}
            actions={
              <button type="button" onClick={() => void reload()}>
                {t('pf5.retry')}
              </button>
            }
          />
        ) : null}
        {rows.length === 0 ? (
          <EmptyState
            compact
            testId="pf-empty"
            icon="forward"
            title={t('pf4.fwdTitle')}
            desc={t('pf4.fwdDesc')}
            primary={{
              label: sessions.length ? t('pf.add') : t('pf4.pickHost'),
              onClick: () => {
                if (!sessions.length) onPickHost?.()
                else document.querySelector<HTMLInputElement>('.pf-form input')?.focus()
              }
            }}
          />
        ) : (
          <table className="pf-table">
            <thead>
              <tr>
                <th>{t('pf.session')}</th>
                <th>{t('pf.local')}</th>
                <th>{t('pf.remote')}</th>
                <th>{t('pf.conns')}</th>
                <th>{t('pf.traffic')}</th>
                <th>{t('pf.status')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const addr = `127.0.0.1:${r.localPort}`
                return (
                  <tr key={r.id} data-forward-id={r.id}>
                    <td>
                      {titleOf.get(r.sessionId) ?? r.sessionId.slice(0, 8)}
                      {r.source === 'profile' ? <span className="pf-badge">{t('pf.fromProfile')}</span> : null}
                    </td>
                    <td className="pf-addr">{addr}</td>
                    <td className="pf-addr">
                      {r.remoteHost}:{r.remotePort}
                    </td>
                    <td>
                      {r.connections} / {r.totalConnections}
                    </td>
                    <td>
                      ↓{fmtBytes(r.bytesIn)} ↑{fmtBytes(r.bytesOut)}
                    </td>
                    <td title={r.lastError ?? ''}>
                      {r.status === 'listening' ? t('pf.listening') : r.status === 'error' ? t('pf.error') : t('pf.starting')}
                    </td>
                    <td className="pf-actions">
                      <button type="button" onClick={() => void copy(addr)}>
                        {copied === addr ? t('pf.copied') : t('pf.copy')}
                      </button>
                      <button type="button" className="danger" onClick={() => void stop(r.id)}>
                        {t('pf.stop')}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  )
}
