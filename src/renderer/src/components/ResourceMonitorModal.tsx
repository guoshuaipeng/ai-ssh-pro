import { useCallback, useEffect, useRef, useState } from 'react'
import type { ResourceSnapshot } from '../../../shared/resource-monitor'
import { formatBytes, formatUptime } from '../../../shared/resource-monitor'
import { pushSample, sparklinePoints } from '../../../shared/server-tools'
import { useI18n } from '../lib/i18n'
import { friendlyErrorMessage } from '../lib/friendly-error'
import Modal from './Modal'
import Icon from './Icon'
import { CHROME_ICON_SIZE, CHROME_ICON_STROKE } from './emptyIcons'
import type { BatchSessionOption } from './BatchExecuteModal'
import Button from './ui/Button'

type Props = {
  open: boolean
  sessions: BatchSessionOption[]
  activeSessionId: string | null
  onClose: () => void
  /** Opens the server toolbox (processes / services / ports / logs) for the same host. */
  onOpenTools?: (sessionId: string) => void
  embedded?: boolean
}

type Sample = { cpu: number | null; mem: number | null; at: number }
const HISTORY_MAX = 60

function Sparkline({ label, values, testId, peakLabel }: { label: string; values: number[]; testId: string; peakLabel: string }) {
  const w = 280
  const h = 64
  const last = values.length ? values[values.length - 1] : null
  const peak = values.length ? Math.max(...values) : null
  const line = values.length > 0 ? sparklinePoints(values, w, h) : ''
  const area = line ? `0,${h} ${line} ${w},${h}` : ''
  return (
    <div className="rm-trend" data-testid={testId}>
      <span className="rm-label">{label}</span>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rm-spark" role="img" aria-label={label}>
        <line x1="0" y1={h * 0.15} x2={w} y2={h * 0.15} className="rm-spark-warn" />
        <text x="2" y="12" className="rm-spark-scale">85%</text>
        <text x="2" y={h - 2} className="rm-spark-scale">0</text>
        {area ? <polygon points={area} className="rm-spark-area" /> : null}
        {line ? <polyline points={line} className="rm-spark-line" /> : null}
      </svg>
      <span className="rm-detail">
        {last == null ? '—' : `${Math.round(last)}%`}
        {peak != null ? ` · ${peakLabel} ${Math.round(peak)}%` : ''}
      </span>
    </div>
  )
}

const REFRESH_MS = 5000

function level(p: number): 'ok' | 'warn' | 'bad' {
  return p >= 85 ? 'bad' : p >= 70 ? 'warn' : 'ok'
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
export default function ResourceMonitorModal({ open, sessions, activeSessionId, onClose, onOpenTools, embedded }: Props) {
  const { t } = useI18n()
  const [sessionId, setSessionId] = useState('')
  const [snap, setSnap] = useState<(ResourceSnapshot & { at: number }) | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [history, setHistory] = useState<Sample[]>([])

  const appliedPref = useRef<string | null>(null)
  useEffect(() => {
    if (!open && !embedded) {
      appliedPref.current = null
      return
    }
    // a target chosen from the sidebar may connect after the modal opened: switch to it once it appears
    if (activeSessionId && appliedPref.current !== activeSessionId && sessions.some((s) => s.sessionId === activeSessionId)) {
      appliedPref.current = activeSessionId
      setSessionId(activeSessionId)
      return
    }
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
      setHistory((h) => pushSample(h, { cpu: r.cpuPercent, mem: r.mem?.percent ?? null, at: r.at }, HISTORY_MAX))
      setError(null)
    } catch (e) {
      setError(friendlyErrorMessage(e))
    }
  }, [])

  const active = open || !!embedded
  useEffect(() => {
    if (!active || !sessionId) return
    setSnap(null)
    void load(sessionId)
    if (paused) return
    const timer = setInterval(() => void load(sessionId), REFRESH_MS)
    return () => clearInterval(timer)
  }, [active, sessionId, paused, load])

  useEffect(() => {
    setHistory([])
  }, [sessionId])

  const cpuTrend = history.map((x) => x.cpu).filter((v): v is number => v != null)
  const memTrend = history.map((x) => x.mem).filter((v): v is number => v != null)

  const loadPct = snap?.load && snap.cores ? (snap.load[0] / snap.cores) * 100 : null

  return (
    <Modal open={open || !!embedded} title={t('rm.title')} onClose={onClose} width={680} embedded={embedded} testId="resource-monitor-panel">
      <div className="rm-panel">
        {sessions.length === 0 ? (
          <p className="rm-empty">{t('rm.noSessions')}</p>
        ) : (
          <div className="rm-toolbar">
            {!embedded ? (
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
            ) : (
              <span className="rm-host-label">{sessions.find((s) => s.sessionId === sessionId)?.title || ''}</span>
            )}
            <button type="button" onClick={() => void load(sessionId)}>
              {t('rm.refresh')}
            </button>
            <label className="rm-pause">
              <input type="checkbox" checked={!paused} onChange={(e) => setPaused(!e.target.checked)} /> {t('rm.auto')}
            </label>
            {onOpenTools && sessionId ? (
              <Button variant="primary" onClick={() => onOpenTools(sessionId)}>
                {t('rm.openToolbox')}
              </Button>
            ) : null}
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
            <div className="rm-trends">
              <p className="rm-trends-title">{t('rm.trend', { min: Math.round((HISTORY_MAX * REFRESH_MS) / 60000) })}</p>
              <Sparkline label={t('rm.cpu')} values={cpuTrend} testId="rm-trend-cpu" peakLabel={t('rm.peak')} />
              <Sparkline label={t('rm.mem')} values={memTrend} testId="rm-trend-mem" peakLabel={t('rm.peak')} />
            </div>
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
                    <td title={`${d.percent}%`}>
                      <div className="rm-bar rm-bar-sm">
                        <div className={`rm-fill rm-${level(d.percent)}`} style={{ width: `${d.percent}%` }} />
                      </div>{' '}
                      {d.percent >= 85 ? <Icon name="triangle-alert" size={CHROME_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} /> : null}{' '}
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
