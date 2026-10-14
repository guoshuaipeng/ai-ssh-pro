import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KillSignal, ListenPort, ProcInfo, ServiceAction, ServiceFilter, ServiceInfo, ProcSort } from '../../../shared/server-tools'
import {
  LOG_PRESETS,
  filterLogLines,
  filterProcesses,
  filterServices,
  forwardTargetHost,
  highlightSegments,
  logLevel,
  suggestLocalPort
} from '../../../shared/server-tools'
import { formatBytes } from '../../../shared/resource-monitor'
import { useI18n } from '../lib/i18n'
import { friendlyErrorMessage } from '../lib/friendly-error'
import { askConfirm, askText } from '../lib/dialogs'
import Modal from './Modal'
import type { BatchSessionOption } from './BatchExecuteModal'

export type ServerToolsTab = 'processes' | 'services' | 'ports' | 'logs'

type Props = {
  open: boolean
  sessions: BatchSessionOption[]
  activeSessionId: string | null
  initialTab?: ServerToolsTab
  onClose: () => void
  embedded?: boolean
}

const cleanErr = (e: unknown) =>
  friendlyErrorMessage(e)

const TABS: ServerToolsTab[] = ['processes', 'services', 'ports', 'logs']

/** Processes, systemd services, listening ports and log tail of one connected Linux host. */
export default function ServerToolsModal({ open, sessions, activeSessionId, initialTab, onClose, embedded }: Props) {
  const { t } = useI18n()
  const [sessionId, setSessionId] = useState('')
  const [tab, setTab] = useState<ServerToolsTab>('processes')
  const [sudo, setSudo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!open && !embedded) return
    if (initialTab) setTab(initialTab)
    setSessionId((cur) =>
      cur && sessions.some((s) => s.sessionId === cur)
        ? cur
        : sessions.find((s) => s.sessionId === activeSessionId)?.sessionId ?? sessions[0]?.sessionId ?? ''
    )
  }, [open, embedded, sessions, activeSessionId, initialTab])

  useEffect(() => {
    setError(null)
    setNotice(null)
  }, [tab, sessionId])

  const guard = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError(cleanErr(e))
      return undefined
    } finally {
      setBusy(false)
    }
  }, [])

  const common = { sessionId, sudo, busy, guard, setNotice, t }

  return (
    <Modal open={open || !!embedded} title={t('st.title')} onClose={onClose} width={900} embedded={embedded} testId="server-tools-panel">
      <div className="st-panel">
        {sessions.length === 0 ? (
          <p className="st-empty">{t('rm.noSessions')}</p>
        ) : (
          <>
            <div className="st-toolbar">
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
                <span className="st-host-label">{sessions.find((s) => s.sessionId === sessionId)?.title || ''}</span>
              )}
              <div className="st-tabs" role="tablist">
                {TABS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={tab === id}
                    className={tab === id ? 'st-tab active' : 'st-tab'}
                    onClick={() => setTab(id)}
                  >
                    {t(`st.tab.${id}` as 'st.tab.processes')}
                  </button>
                ))}
              </div>
              <label className="st-sudo" title={t('st.sudoHint')}>
                <input type="checkbox" checked={sudo} onChange={(e) => setSudo(e.target.checked)} /> {t('st.sudo')}
              </label>
            </div>
            {error ? <p className="st-error">{error}</p> : null}
            {notice ? <p className="st-notice">{notice}</p> : null}
            {sessionId && tab === 'processes' ? <ProcessesTab key={sessionId} {...common} /> : null}
            {sessionId && tab === 'services' ? <ServicesTab key={sessionId} {...common} /> : null}
            {sessionId && tab === 'ports' ? <PortsTab key={sessionId} {...common} /> : null}
            {sessionId && tab === 'logs' ? <LogsTab key={sessionId} {...common} /> : null}
          </>
        )}
      </div>
    </Modal>
  )
}

type TabProps = {
  sessionId: string
  sudo: boolean
  busy: boolean
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>
  setNotice: (s: string | null) => void
  t: ReturnType<typeof useI18n>['t']
}

function ProcessesTab({ sessionId, sudo, busy, guard, setNotice, t }: TabProps) {
  const [list, setList] = useState<ProcInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<ProcSort>('cpu')
  const load = useCallback(async () => {
    const r = await guard(() => window.aiss.tools.processes(sessionId))
    if (r) setList(r)
  }, [guard, sessionId])
  useEffect(() => {
    void load()
  }, [load])
  const shown = useMemo(() => (list ? filterProcesses(list, query, sort).slice(0, 200) : []), [list, query, sort])

  const kill = async (p: ProcInfo, signal: KillSignal) => {
    const ok = await askConfirm(
      t('st.killTitle', { signal }),
      t('st.killMsg', { pid: p.pid, cmd: p.command.slice(0, 120) }),
      { danger: signal === 'KILL', okLabel: t('st.send') }
    )
    if (!ok) return
    const r = await guard(() => window.aiss.tools.kill(sessionId, p.pid, signal, sudo))
    if (r) {
      setNotice(t('st.killed', { signal, pid: p.pid }))
      void load()
    }
  }

  return (
    <div className="st-body">
      <div className="st-row">
        <input
          className="st-search"
          placeholder={t('st.procSearch')}
          aria-label={t('st.procSearch')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label>
          {t('st.sortBy')}{' '}
          <select value={sort} onChange={(e) => setSort(e.target.value as ProcSort)} aria-label={t('st.sortBy')}>
            <option value="cpu">CPU</option>
            <option value="mem">{t('rm.mem')}</option>
            <option value="pid">PID</option>
          </select>
        </label>
        <button type="button" onClick={() => void load()} disabled={busy}>
          {t('rm.refresh')}
        </button>
        {list ? <span className="st-count">{t('st.count', { shown: shown.length, total: list.length })}</span> : null}
      </div>
      {!list && busy ? <p className="st-empty">{t('rm.loading')}</p> : null}
      {list ? (
        <div className="st-table-wrap">
          <table className="st-table st-procs">
            <thead>
              <tr>
                <th>PID</th>
                <th>{t('st.user')}</th>
                <th>CPU%</th>
                <th>{t('st.memPct')}</th>
                <th>RSS</th>
                <th>{t('st.elapsed')}</th>
                <th>{t('st.command')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={p.pid} className={p.cpu >= 50 ? 'st-hot' : undefined}>
                  <td>{p.pid}</td>
                  <td>{p.user}</td>
                  <td className="num">{p.cpu.toFixed(1)}</td>
                  <td className="num">{p.mem.toFixed(1)}</td>
                  <td className="num">{formatBytes(p.rssKb * 1024)}</td>
                  <td>{p.etime}</td>
                  <td className="st-cmd" title={p.command}>
                    {p.command}
                  </td>
                  <td className="st-actions st-actions--hover">
                    <button type="button" className="st-icon-btn" onClick={() => void kill(p, 'TERM')} disabled={busy} title={t('st.termHint')} aria-label={t('st.term')}>
                      ⏹
                    </button>
                    <details className="st-more">
                      <summary className="st-icon-btn" title="…" aria-label="…">⋯</summary>
                      <div className="st-more-menu">
                        <button type="button" className="danger" onClick={() => void kill(p, 'KILL')} disabled={busy} title={t('st.killHint')}>
                          {t('st.kill')} (kill -9)
                        </button>
                      </div>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function ServicesTab({ sessionId, sudo, busy, guard, setNotice, t }: TabProps) {
  const [list, setList] = useState<ServiceInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<ServiceFilter>('all')
  const [status, setStatus] = useState<{ unit: string; text: string } | null>(null)
  const load = useCallback(async () => {
    const r = await guard(() => window.aiss.tools.services(sessionId))
    if (r) setList(r)
  }, [guard, sessionId])
  useEffect(() => {
    void load()
  }, [load])
  const shown = useMemo(() => (list ? filterServices(list, query, filter) : []), [list, query, filter])
  const failed = list?.filter((s) => s.active === 'failed').length ?? 0

  const act = async (s: ServiceInfo, action: ServiceAction) => {
    if (action === 'status') {
      const r = await guard(() => window.aiss.tools.service(sessionId, s.unit, 'status', sudo))
      if (r) setStatus({ unit: s.unit, text: r.output })
      return
    }
    const ok = await askConfirm(t('st.svcConfirmTitle'), t('st.svcConfirmMsg', { action: t(`st.svc.${action}` as 'st.svc.start'), unit: s.unit }), {
      danger: action === 'stop',
      okLabel: t(`st.svc.${action}` as 'st.svc.start')
    })
    if (!ok) return
    const r = await guard(() => window.aiss.tools.service(sessionId, s.unit, action, sudo))
    if (r) {
      setNotice(t('st.svcDone', { action: t(`st.svc.${action}` as 'st.svc.start'), unit: s.unit }))
      void load()
    }
  }

  return (
    <div className="st-body">
      <div className="st-row">
        <input
          className="st-search"
          placeholder={t('st.svcSearch')}
          aria-label={t('st.svcSearch')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as ServiceFilter)} aria-label={t('st.svcFilter')}>
          <option value="all">{t('st.svcAll')}</option>
          <option value="running">{t('st.svcRunning')}</option>
          <option value="failed">{t('st.svcFailed')}</option>
          <option value="inactive">{t('st.svcInactive')}</option>
        </select>
        <button type="button" onClick={() => void load()} disabled={busy}>
          {t('rm.refresh')}
        </button>
        {list ? <span className="st-count">{t('st.count', { shown: shown.length, total: list.length })}</span> : null}
        {failed > 0 ? (
          <button type="button" className="st-badge-bad" onClick={() => setFilter('failed')}>
            {t('st.failedBadge', { n: failed })}
          </button>
        ) : null}
      </div>
      {!list && busy ? <p className="st-empty">{t('rm.loading')}</p> : null}
      {list ? (
        <div className="st-table-wrap">
          <table className="st-table st-services">
            <thead>
              <tr>
                <th>{t('st.unit')}</th>
                <th>{t('st.state')}</th>
                <th>{t('st.description')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.unit} className={`st-svc st-svc-${s.active}`}>
                  <td>{s.unit}</td>
                  <td>
                    <span className={`st-state st-state-${s.active}`}>
                      {s.active}/{s.sub}
                    </span>
                  </td>
                  <td className="st-cmd" title={s.description}>
                    {s.description}
                  </td>
                  <td className="st-actions st-actions--hover">
                    <button type="button" onClick={() => void act(s, 'status')} disabled={busy}>
                      {t('st.svc.status')}
                    </button>
                    {s.sub === 'running' ? (
                      <>
                        <button type="button" onClick={() => void act(s, 'restart')} disabled={busy}>
                          {t('st.svc.restart')}
                        </button>
                        <button type="button" className="danger" onClick={() => void act(s, 'stop')} disabled={busy}>
                          {t('st.svc.stop')}
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => void act(s, 'start')} disabled={busy}>
                        {t('st.svc.start')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {status ? (
        <div className="st-status">
          <div className="st-row">
            <strong>{status.unit}</strong>
            <button type="button" onClick={() => setStatus(null)}>
              {t('common.close')}
            </button>
          </div>
          <pre className="st-pre">{status.text}</pre>
        </div>
      ) : null}
    </div>
  )
}

function PortsTab({ sessionId, busy, guard, setNotice, t }: TabProps) {
  const [list, setList] = useState<ListenPort[] | null>(null)
  const [proto, setProto] = useState<'all' | 'tcp' | 'udp'>('tcp')
  const load = useCallback(async () => {
    const r = await guard(() => window.aiss.tools.ports(sessionId))
    if (r) setList(r)
  }, [guard, sessionId])
  useEffect(() => {
    void load()
  }, [load])
  const shown = useMemo(() => (list ?? []).filter((p) => proto === 'all' || p.proto === proto), [list, proto])

  const forward = async (p: ListenPort) => {
    const value = await askText(t('st.fwdPrompt', { port: p.port }), String(suggestLocalPort(p.port)))
    if (value == null) return
    const localPort = Number(value.trim())
    if (!Number.isInteger(localPort) || localPort < 1 || localPort > 65535) {
      setNotice(t('st.fwdBadPort'))
      return
    }
    const remoteHost = forwardTargetHost(p.address)
    const r = await guard(() => window.aiss.workspace.forwards.add({ sessionId, localPort, remoteHost, remotePort: p.port }))
    if (r) setNotice(t('st.fwdDone', { local: localPort, remote: `${remoteHost}:${p.port}` }))
  }

  return (
    <div className="st-body">
      <div className="st-row">
        <select value={proto} onChange={(e) => setProto(e.target.value as 'all' | 'tcp' | 'udp')} aria-label={t('st.proto')}>
          <option value="tcp">TCP</option>
          <option value="udp">UDP</option>
          <option value="all">{t('st.svcAll')}</option>
        </select>
        <button type="button" onClick={() => void load()} disabled={busy}>
          {t('rm.refresh')}
        </button>
        {list ? <span className="st-count">{t('st.count', { shown: shown.length, total: list.length })}</span> : null}
        <span className="st-hint">{t('st.portsHint')}</span>
      </div>
      {!list && busy ? <p className="st-empty">{t('rm.loading')}</p> : null}
      {list && list.length === 0 ? <p className="st-empty">{t('st.noPorts')}</p> : null}
      {shown.length ? (
        <div className="st-table-wrap">
          <table className="st-table st-ports">
            <thead>
              <tr>
                <th>{t('st.proto')}</th>
                <th>{t('st.address')}</th>
                <th>{t('st.port')}</th>
                <th>{t('st.process')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <tr key={`${p.proto}|${p.address}|${p.port}`} className="st-port">
                  <td>{p.proto.toUpperCase()}</td>
                  <td>{p.address}</td>
                  <td className="num">{p.port}</td>
                  <td>{p.process ? `${p.process}${p.pid ? ` (${p.pid})` : ''}` : '—'}</td>
                  <td className="st-actions">
                    {p.proto === 'tcp' ? (
                      <button type="button" onClick={() => void forward(p)} disabled={busy}>
                        {t('st.forward')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function LogsTab({ sessionId, sudo, busy, guard, t }: TabProps) {
  const [source, setSource] = useState<'journal' | 'unit' | 'file'>('file')
  const [path, setPath] = useState(LOG_PRESETS[0])
  const [unit, setUnit] = useState('')
  const [lines, setLines] = useState(200)
  const [query, setQuery] = useState('')
  const [level, setLevel] = useState<'all' | 'warn' | 'error'>('all')
  const [follow, setFollow] = useState(false)
  const [data, setData] = useState<{ text: string; at: number } | null>(null)

  const load = useCallback(async () => {
    const req = { source, path: source === 'file' ? path.trim() : undefined, unit: source === 'unit' ? unit.trim() : undefined, lines, sudo }
    const r = await guard(() => window.aiss.tools.logs(sessionId, req))
    if (r) setData(r)
  }, [guard, sessionId, source, path, unit, lines, sudo])

  useEffect(() => {
    void load() // UX-42: auto-read last N lines when opening Logs
  }, [load])

  useEffect(() => {
    if (!follow) return
    const timer = setInterval(() => void load(), 3000)
    return () => clearInterval(timer)
  }, [follow, load])

  const shown = useMemo(() => (data ? filterLogLines(data.text, { query, level }) : []), [data, query, level])

  return (
    <div className="st-body">
      <div className="st-row">
        <select value={source} onChange={(e) => setSource(e.target.value as 'journal' | 'unit' | 'file')} aria-label={t('st.logSource')}>
          <option value="file">{t('st.logFile')}</option>
          <option value="journal">{t('st.logJournal')}</option>
          <option value="unit">{t('st.logUnit')}</option>
        </select>
        {source === 'file' ? (
          <>
            <input className="st-path" list="st-log-presets" value={path} onChange={(e) => setPath(e.target.value)} aria-label={t('st.logPath')} />
            <datalist id="st-log-presets">
              {LOG_PRESETS.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </>
        ) : null}
        {source === 'unit' ? (
          <input className="st-path" placeholder="nginx.service" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={t('st.unit')} />
        ) : null}
        <label>
          {t('st.lines')}{' '}
          <select value={lines} onChange={(e) => setLines(Number(e.target.value))} aria-label={t('st.lines')}>
            {[100, 200, 500, 1000, 2000].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="primary" onClick={() => void load()} disabled={busy}>
          {t('st.loadLog')}
        </button>
        <label className="st-follow">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> {t('st.follow')}
        </label>
      </div>
      <div className="st-row">
        <input className="st-search" placeholder={t('st.logFilter')} aria-label={t('st.logFilter')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <select value={level} onChange={(e) => setLevel(e.target.value as 'all' | 'warn' | 'error')} aria-label={t('st.level')}>
          <option value="all">{t('st.levelAll')}</option>
          <option value="warn">{t('st.levelWarn')}</option>
          <option value="error">{t('st.levelError')}</option>
        </select>
        {data ? (
          <span className="st-count">
            {t('st.count', { shown: shown.length, total: data.text ? data.text.split(/\r?\n/).filter(Boolean).length : 0 })} ·{' '}
            {t('rm.updated', { time: new Date(data.at).toLocaleTimeString() })}
          </span>
        ) : null}
        {data ? (
          <button type="button" onClick={() => void navigator.clipboard.writeText(shown.join('\n'))}>
            {t('st.copy')}
          </button>
        ) : null}
      </div>
      {data ? (
        <pre className="st-pre st-log" data-testid="st-log">
          {shown.map((l, i) => (
            <div key={i} className={`st-log-line st-log-${logLevel(l)}`}>
              {highlightSegments(l, query).map((seg, j) => (seg.hit ? <mark key={j}>{seg.text}</mark> : <span key={j}>{seg.text}</span>))}
            </div>
          ))}
        </pre>
      ) : busy ? (
        <p className="st-empty">{t('st.logReading')}</p>
      ) : (
        <p className="st-empty">{t('st.logIntro')}</p>
      )}
    </div>
  )
}
