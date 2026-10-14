import { useCallback, useEffect, useState } from 'react'
import type { ResourceSnapshot } from '../../../shared/resource-monitor'
import { formatBytes, formatUptime } from '../../../shared/resource-monitor'
import { useI18n } from '../lib/i18n'
import Modal from './Modal'
import type { BatchSessionOption } from './BatchExecuteModal'

type Props = {
  open: boolean
  sessions: BatchSessionOption[]
  activeSessionId: string | null
  onClose: () => void
}

const REFRESH_MS = 5000

function level(p: number): 'ok' | 'warn' | 'bad' {
  return p >= 90 ? 'bad' : p >= 70 ? 'warn' : 'ok'
}

function Bar({ label, percent, detail }: { label: string; percent: number | null; detail?: string }) {
  const p = percent == null ? 0 : Math.max(0, Math.min(100, percent))
  return (
    <div className="rm-row">
      <span className="rm-label">{label}</span>
      <div className="rm-bar" role="progressbar" aria-label={label} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
        <div className={`rm-fill rm-${level(p)}`} style={{ width: `${p}%` }} />
      </div>
      <span className="rm-value">{percent == null ? '—' : `${Math.round(percent * 10) / 10}%`}</span>
      {detail ? <span className="rm-detail">{detail}</span> : null}
    </div>
  )
}

/** CPU / memory / swap / load / disks of a connected Linux host, refreshed every 5 s over an exec channel. */
export default function ResourceMonitorModal({ open, sessions, activeSessionId, onClose }: Props) {
  const { t } = useI18n()
  const [sessionId, setSessionId] = useState('')
  const [snap, setSnap] = useState<(ResourceSnapshot & { at: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (!open) return
    setSessionId((cur) =>
      cur && sessions.some((s) => s.sessionId === cur)
        ? cur
        : sessions.find((s) => s.sessionId === activeSessionId)?.sessionId ?? sessions[0]?.sessionId ?? ''
    )
  }, [open, sessions, activeSessionId])

  const load = useCallback(async (sid: string) => {
    if (!sid) return
    try {
      const r = await window.aiss.workspace.resources(sid)
      setSnap(r)
      setError(null)
    } catch (e) {
      setError((e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
    }
  }, [])

  useEffect(() => {
    if (!open || !sessionId) return
    setSnap(null)
    void load(sessionId)
    if (paused) return
    const timer = setInterval(() => void load(sessionId), REFRESH_MS)
    return () => clearInterval(timer)
  }, [open, sessionId, paused, load])

  const loadPct = snap?.load && snap.cores ? (snap.load[0] / snap.cores) * 100 : null

  return (
    <Modal open={open} title={t('rm.title')} onClose={onClose} width={680}>
      <div className="rm-panel">
        {sessions.length === 0 ? (
          <p className="rm-empty">{t('rm.noSessions')}</p>
        ) : (
          <div className="rm-toolbar">
            <label>
              {t('rm.session')}{' '}
              <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
                {sessions.map((s) => (
                  <option key={s.sessionId} value={s.sessionId}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => void load(sessionId)}>
              {t('rm.refresh')}
            </button>
            <label className="rm-pause">
              <input type="checkbox" checked={!paused} onChange={(e) => setPaused(!e.target.checked)} /> {t('rm.auto')}
            </label>
            {snap ? <span className="rm-time">{t('rm.updated', { time: new Date(snap.at).toLocaleTimeString() })}</span> : null}
          </div>
        )}
        {error ? <p className="rm-error">{error}</p> : null}
        {!snap && !error && sessions.length > 0 ? <p className="rm-empty">{t('rm.loading')}</p> : null}
        {snap ? (
          <>
            <Bar label={t('rm.cpu')} percent={snap.cpuPercent} detail={snap.cores ? t('rm.cores', { n: snap.cores }) : undefined} />
            <Bar
              label={t('rm.mem')}
              percent={snap.mem?.percent ?? null}
              detail={snap.mem ? `${formatBytes(snap.mem.used)} / ${formatBytes(snap.mem.total)}` : undefined}
            />
            <Bar
              label={t('rm.swap')}
              percent={snap.swap && snap.swap.total > 0 ? snap.swap.percent : null}
              detail={snap.swap && snap.swap.total > 0 ? `${formatBytes(snap.swap.used)} / ${formatBytes(snap.swap.total)}` : t('rm.none')}
            />
            <Bar label={t('rm.load')} percent={loadPct} detail={snap.load ? snap.load.join(' / ') : undefined} />
            {snap.uptimeSec != null ? (
              <p className="rm-uptime">
                {t('rm.uptime')}: {formatUptime(snap.uptimeSec)}
              </p>
            ) : null}
            <table className="rm-disks">
              <thead>
                <tr>
                  <th>{t('rm.mount')}</th>
                  <th>{t('rm.fs')}</th>
                  <th>{t('rm.size')}</th>
                  <th>{t('rm.used')}</th>
                </tr>
              </thead>
              <tbody>
                {snap.disks.map((d) => (
                  <tr key={`${d.fs}:${d.mount}`} className={`rm-disk rm-${level(d.percent)}`}>
                    <td>{d.mount}</td>
                    <td>{d.fs}</td>
                    <td>{formatBytes(d.totalKb * 1024)}</td>
                    <td>
                      <div className="rm-bar rm-bar-sm">
                        <div className={`rm-fill rm-${level(d.percent)}`} style={{ width: `${d.percent}%` }} />
                      </div>{' '}
                      {d.percent}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </div>
    </Modal>
  )
}
