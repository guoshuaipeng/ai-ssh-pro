import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DfRow, KillSignal, ListenPort, ProcInfo, ServiceAction, ServiceFilter, ServiceInfo, ProcSort } from '../../../shared/server-tools'
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
import Select from './ui/Select'
import Icon from './Icon'
import { CHROME_ICON_SIZE, CHROME_ICON_STROKE, EMPTY_ICON_SIZE_COMPACT, EMPTY_ICON_STROKE } from './emptyIcons'
import { friendlyErrorMessage } from '../lib/friendly-error'
import { askConfirm, askText } from '../lib/dialogs'
import Modal from './Modal'
import EmptyState from './EmptyState'
import { QUIET_LOAD_ATTRS } from '@shared/quiet-load'
import type { BatchSessionOption } from './BatchExecuteModal'
import DockerToolboxTab, { type DockerToolboxOpen } from './DockerToolboxTab'
import Button from './ui/Button'

export type ServerToolsTab = 'processes' | 'services' | 'ports' | 'logs' | 'df' | 'docker'

type Props = {
  open: boolean
  sessions: BatchSessionOption[]
  activeSessionId: string | null
  initialTab?: ServerToolsTab
  onClose: () => void
  embedded?: boolean
  /** S4: kill and service start/stop/restart stay disabled. */
  writesDisabled?: boolean
  /** Open the existing workspace Docker panel for one compose project, swarm service, or container. */
  onOpenDocker?: (target: DockerToolboxOpen) => void
  /** Refresh the session-tree Docker cache after a toolbox action. */
  onDockerChanged?: () => void
}

const cleanErr = (e: unknown) =>
  friendlyErrorMessage(e)

const TABS: ServerToolsTab[] = ['processes', 'services', 'ports', 'logs', 'df', 'docker']

/** Processes, systemd services, listening ports and log tail of one connected Linux host. */
export default function ServerToolsModal({ open, sessions, activeSessionId, initialTab, onClose, embedded, writesDisabled = false, onOpenDocker, onDockerChanged }: Props) {
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

  const common = { sessionId, sudo, busy, guard, setNotice, t, writesDisabled }

  return (
    <Modal open={open || !!embedded} title={t('st.title')} onClose={onClose} width={900} embedded={embedded} testId="server-tools-panel">
      <div className="st-panel">
        {sessions.length === 0 ? (
          <EmptyState icon="host" title={t('rm.noSessions')} desc={t('p11.toolboxNext')} testId="toolbox-no-sessions" />
        ) : (
          <>
            <div className="st-toolbar">
              {!embedded ? (
              <label>
                {t('rm.session')}{' '}
                <Select testId="st-session" ariaLabel={t('rm.session')} value={sessionId} onChange={setSessionId} options={sessions.map((s) => ({ value: s.sessionId, label: s.title }))} />
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
            {sessionId && tab === 'df' ? <DiskTab key={sessionId} {...common} /> : null}
            {sessionId && tab === 'docker' ? (
              <DockerToolboxTab
                key={sessionId}
                sessionId={sessionId}
                busy={busy}
                writesDisabled={writesDisabled}
                guard={guard}
                setNotice={setNotice}
                t={t}
                onOpenDocker={onOpenDocker}
                onDockerChanged={onDockerChanged}
              />
            ) : null}
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
  writesDisabled?: boolean
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>
  setNotice: (s: string | null) => void
  t: ReturnType<typeof useI18n>['t']
}

function DiskTab({ sessionId, busy, guard, t }: TabProps) {
  const [list, setList] = useState<DfRow[] | null>(null)
  const load = useCallback(async () => {
    const r = await guard(() => window.aiss.tools.df(sessionId))
    if (r) setList(r)
  }, [guard, sessionId])
  useEffect(() => {
    void load()
  }, [load])
  if (!list) return <p className="quiet-load" {...QUIET_LOAD_ATTRS}>{t('rm.loading')}</p>
  if (!list.length) {
    return <EmptyState compact icon={<Icon name="list-tree" size={EMPTY_ICON_SIZE_COMPACT} strokeWidth={EMPTY_ICON_STROKE} />} title={t('st.dfEmpty')} testId="toolbox-df-empty" />
  }
  return (
    <div className="st-table-wrap" data-testid="toolbox-df">
      <table className="st-table">
        <thead>
          <tr>
            <th>{t('o1.disk')}</th>
            <th>{t('st.df.size')}</th>
            <th>{t('st.df.used')}</th>
            <th>%</th>
            <th>{t('st.df.mount')}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((d) => (
            <tr key={`${d.fs}:${d.mount}`} className={d.percent >= 85 ? 'is-alert' : ''}>
              <td>{d.fs}</td>
              <td>{d.size}</td>
              <td>{d.used}</td>
              <td className="num">{d.percent}%</td>
              <td>{d.mount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" disabled={busy} onClick={() => void load()}>
        {t('rm.refresh')}
      </button>
    </div>
  )
}

function ProcessesTab({ sessionId, sudo, busy, guard, setNotice, t, writesDisabled }: TabProps) {
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
      { id: 'confirm.killProcess', danger: true, okLabel: t('st.kill') }
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
          <Select testId="st-sort" ariaLabel={t('st.sortBy')} value={sort} onChange={(v) => setSort(v as ProcSort)} options={[{ value: 'cpu', label: 'CPU' }, { value: 'mem', label: t('rm.mem') }, { value: 'pid', label: 'PID' }]} />
        </label>
        <button type="button" onClick={() => void load()} disabled={busy}>
          {t('rm.refresh')}
        </button>
        {list ? <span className="st-count">{t('st.count', { shown: shown.length, total: list.length })}</span> : null}
      </div>
      {!list && busy ? <p className="quiet-load" {...QUIET_LOAD_ATTRS}>{t('rm.loading')}</p> : null}
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
                    <button type="button" className="st-icon-btn" onClick={() => void kill(p, 'TERM')} disabled={busy || writesDisabled} title={writesDisabled ? t('s4.sftpDisabled') : t('st.termHint')} aria-label={t('st.term')}>
                      <Icon name="square" size={CHROME_ICON_SIZE} strokeWidth={CHROME_ICON_STROKE} />
                    </button>
                    <details className="st-more">
                      <summary className="st-icon-btn" title="…" aria-label="…">⋯</summary>
                      <div className="st-more-menu">
                        <button type="button" className="danger" onClick={() => void kill(p, 'KILL')} disabled={busy || writesDisabled} title={writesDisabled ? t('s4.sftpDisabled') : t('st.killHint')}>
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

function ServicesTab({ sessionId, sudo, busy, guard, setNotice, t, writesDisabled }: TabProps) {
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
      id: 'confirm.stopService',
      danger: action !== 'start',
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
        <Select testId="st-svc-filter" ariaLabel={t('st.svcFilter')} value={filter} onChange={(v) => setFilter(v as ServiceFilter)} options={[{ value: 'all', label: t('st.svcAll') }, { value: 'running', label: t('st.svcRunning') }, { value: 'failed', label: t('st.svcFailed') }, { value: 'inactive', label: t('st.svcInactive') }]} />
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
      {!list && busy ? <p className="quiet-load" {...QUIET_LOAD_ATTRS}>{t('rm.loading')}</p> : null}
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
                        <button type="button" onClick={() => void act(s, 'restart')} disabled={busy || writesDisabled} title={writesDisabled ? t('s4.sftpDisabled') : undefined}>
                          {t('st.svc.restart')}
                        </button>
                        <button type="button" className="danger" onClick={() => void act(s, 'stop')} disabled={busy || writesDisabled} title={writesDisabled ? t('s4.sftpDisabled') : undefined}>
                          {t('st.svc.stop')}
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => void act(s, 'start')} disabled={busy || writesDisabled} title={writesDisabled ? t('s4.sftpDisabled') : undefined}>
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
        <Select testId="st-proto" ariaLabel={t('st.proto')} value={proto} onChange={(v) => setProto(v as 'all' | 'tcp' | 'udp')} options={[{ value: 'tcp', label: 'TCP' }, { value: 'udp', label: 'UDP' }, { value: 'all', label: t('st.svcAll') }]} />
        <button type="button" onClick={() => void load()} disabled={busy}>
          {t('rm.refresh')}
        </button>
        {list ? <span className="st-count">{t('st.count', { shown: shown.length, total: list.length })}</span> : null}
        <span className="st-hint">{t('st.portsHint')}</span>
      </div>
      {!list && busy ? <p className="quiet-load" {...QUIET_LOAD_ATTRS}>{t('rm.loading')}</p> : null}
      {list && list.length === 0 ? (
        <EmptyState compact icon="forward" title={t('st.noPorts')} testId="toolbox-no-ports" />
      ) : null}
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
        <Select testId="st-log-source" ariaLabel={t('st.logSource')} value={source} onChange={(v) => setSource(v as 'journal' | 'unit' | 'file')} options={[{ value: 'file', label: t('st.logFile') }, { value: 'journal', label: t('st.logJournal') }, { value: 'unit', label: t('st.logUnit') }]} />
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
          <Select testId="st-lines" ariaLabel={t('st.lines')} value={String(lines)} onChange={(v) => setLines(Number(v))} options={[100, 200, 500, 1000, 2000].map((n) => ({ value: String(n), label: String(n) }))} />
        </label>
        <Button variant="primary" onClick={() => void load()} disabled={busy}>
          {t('st.loadLog')}
        </Button>
        <label className="st-follow">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> {t('st.follow')}
        </label>
      </div>
      <div className="st-row">
        <input className="st-search" placeholder={t('st.logFilter')} aria-label={t('st.logFilter')} value={query} onChange={(e) => setQuery(e.target.value)} />
        <Select testId="st-level" ariaLabel={t('st.level')} value={level} onChange={(v) => setLevel(v as 'all' | 'warn' | 'error')} options={[{ value: 'all', label: t('st.levelAll') }, { value: 'warn', label: t('st.levelWarn') }, { value: 'error', label: t('st.levelError') }]} />
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
        <p className="quiet-load" {...QUIET_LOAD_ATTRS}>{t('st.logReading')}</p>
      ) : (
        <p className="quiet-load" {...QUIET_LOAD_ATTRS}>{t('st.logIntro')}</p>
      )}
    </div>
  )
}
