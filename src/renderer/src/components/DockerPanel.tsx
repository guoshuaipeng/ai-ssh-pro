import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DockerComposeService,
  DockerContainer,
  DockerContainerAction,
  DockerContainerDetail,
  DockerComposeAction,
  DockerKeyValue,
  DockerMount,
  DockerSwarmPort,
  DockerSwarmServiceDetail
} from '@shared/ipc'
import { loadDockerPrefs, saveDockerPrefs } from '../lib/docker-prefs'
import { tg } from '../lib/i18n'
import { Twist } from './Icon'
import { confirmDialog, promptDialog } from '../lib/dialogs'

type Props = {
  sessionId: string
  kind: 'container' | 'compose' | 'swarm'
  resourceId: string
  resourceName: string
  onClose: () => void
  onTreeDirty?: () => void
  onOpenShell?: () => void
}

const LOG_TAIL = 400
const FOLLOW_INTERVAL_MS = 2000

/** 值可能是口令/密钥的环境变量，默认打码，避免共享屏幕时泄露 */
const SENSITIVE_ENV_KEY = /(pass|pwd|secret|token|key|credential|auth)/i

function maskValue(value: string): string {
  if (!value) return ''
  if (value.length <= 4) return '••••'
  return `${value.slice(0, 2)}••••${value.slice(-2)}`
}

type EnvGroupProps = {
  total: number
  visible: DockerKeyValue[]
  filter: string
  onFilter: (v: string) => void
  showSecrets: boolean
  onShowSecrets: (v: boolean) => void
}

function EnvGroup({ total, visible, filter, onFilter, showSecrets, onShowSecrets }: EnvGroupProps) {
  return (
    <section className="docker-detail-group docker-detail-group--wide">
      <header className="docker-detail-group-header">
        <h4>
          {tg('ui.57')}
          <span className="docker-group-count">
            {filter.trim() ? `${visible.length}/${total}` : total}
          </span>
        </h4>
        <div className="docker-group-tools">
          <input
            type="search"
            className="docker-group-filter"
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            placeholder={tg('ui.58')}
            aria-label={tg('ui.59')}
          />
          <label className="docker-secret-toggle">
            <input
              type="checkbox"
              checked={showSecrets}
              onChange={(e) => onShowSecrets(e.target.checked)}
            />
            {tg('ui.60')}
          </label>
        </div>
      </header>
      {visible.length === 0 ? (
        <p className="docker-panel-muted">{total === 0 ? tg('ui.61') : tg('ui.62')}</p>
      ) : (
        <dl className="docker-kv-list is-scroll">
          {visible.map((item) => {
            const masked = !showSecrets && SENSITIVE_ENV_KEY.test(item.key) && item.value !== ''
            return (
              <div key={item.key} className="docker-kv-row">
                <dt title={item.key}>{item.key}</dt>
                <dd className={masked ? 'is-masked' : undefined}>
                  {masked ? maskValue(item.value) : item.value || <em>{tg('ui.63')}</em>}
                </dd>
              </div>
            )
          })}
        </dl>
      )}
    </section>
  )
}

function LabelGroup({ title, items }: { title: string; items: DockerKeyValue[] }) {
  return (
    <section className="docker-detail-group">
      <header className="docker-detail-group-header">
        <h4>
          {title}
          <span className="docker-group-count">{items.length}</span>
        </h4>
      </header>
      {items.length === 0 ? (
        <p className="docker-panel-muted">{tg('ui.61')}</p>
      ) : (
        <dl className="docker-kv-list is-scroll">
          {items.map((item) => (
            <div key={item.key} className="docker-kv-row">
              <dt title={item.key}>{item.key}</dt>
              <dd>{item.value || <em>{tg('ui.63')}</em>}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function MountGroup({ mounts }: { mounts: DockerMount[] }) {
  return (
    <section className="docker-detail-group docker-detail-group--wide">
      <header className="docker-detail-group-header">
        <h4>
          {tg('ui.64')}<span className="docker-group-count">{mounts.length}</span>
        </h4>
      </header>
      {mounts.length === 0 ? (
        <p className="docker-panel-muted">{tg('ui.61')}</p>
      ) : (
        <ul className="docker-detail-list is-scroll">
          {mounts.map((m, i) => (
            <li key={`${m.destination}-${i}`}>
              <code>{m.source || tg('ui.65', { 0: String(m.type) })}</code>
              <span className="docker-detail-arrow" aria-hidden="true">
                →
              </span>
              <code>{m.destination}</code>
              <span className="docker-detail-note">{m.readWrite ? tg('ui.66') : tg('ui.67')}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 服务级发布端口：宿主机端口 → 容器端口，并标注 ingress / host 模式 */
function SwarmPortList({ ports }: { ports: DockerSwarmPort[] }) {
  if (ports.length === 0) return <p className="docker-panel-muted">{tg('ui.68')}</p>
  return (
    <ul className="docker-detail-list">
      {ports.map((p, i) => (
        <li key={`${p.targetPort}-${p.publishedPort ?? 'none'}-${p.protocol}-${i}`}>
          {p.publishedPort ? (
            <>
              <code>{p.publishedPort}</code>
              <span className="docker-detail-arrow" aria-hidden="true">
                →
              </span>
              <code>
                {p.targetPort}/{p.protocol}
              </code>
            </>
          ) : (
            <code>
              {p.targetPort}/{p.protocol}
            </code>
          )}
          <span className="docker-detail-note">
            {p.publishMode === 'host' ? tg('ui.69') : tg('ui.70')}
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function DockerPanel({
  sessionId,
  kind,
  resourceId,
  resourceName,
  onClose,
  onTreeDirty,
  onOpenShell
}: Props) {
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const [logs, setLogs] = useState('')
  const [container, setContainer] = useState<DockerContainer | null>(null)
  const [detail, setDetail] = useState<DockerContainerDetail | null>(null)
  const [swarmDetail, setSwarmDetail] = useState<DockerSwarmServiceDetail | null>(null)
  // 所有容器 / Swarm 服务共用同一显示偏好，写入 localStorage
  const [showConfig, setShowConfig] = useState(() => loadDockerPrefs().showConfig)

  const toggleShowConfig = (on: boolean) => {
    setShowConfig(on)
    saveDockerPrefs({ showConfig: on })
  }
  const [showSecrets, setShowSecrets] = useState(false)
  const [envFilter, setEnvFilter] = useState('')
  const [services, setServices] = useState<DockerComposeService[]>([])
  const [follow, setFollow] = useState(true)
  const [logFilter, setLogFilter] = useState('')
  const logsRef = useRef<HTMLPreElement>(null)
  const stickToBottomRef = useRef(true)

  const findContainerMeta = useCallback(async () => {
    const tree = await window.aiss.docker.listTree(sessionId)
    const inStandalone = tree.containers.find((c) => c.id === resourceId || c.name === resourceName)
    if (inStandalone) return { hit: inStandalone, error: tree.containersError }
    for (const p of tree.composeProjects) {
      const hit = p.containers.find((c) => c.id === resourceId || c.name === resourceName)
      if (hit) return { hit, error: tree.containersError }
    }
    for (const stack of tree.swarm.stacks) {
      for (const svc of stack.services) {
        const hit = svc.containers.find((c) => c.id === resourceId || c.name === resourceName)
        if (hit) return { hit, error: tree.containersError }
      }
    }
    return { hit: null, error: tree.containersError }
  }, [resourceId, resourceName, sessionId])

  const fetchLogs = useCallback(async () => {
    const text =
      kind === 'swarm'
        ? await window.aiss.docker.swarmLogs(sessionId, resourceId, LOG_TAIL)
        : await window.aiss.docker.logs(sessionId, resourceId, LOG_TAIL)
    setLogs(text)
  }, [kind, resourceId, sessionId])

  const refresh = useCallback(async () => {
    setError(null)
    setHint(null)
    try {
      if (kind === 'container') {
        const { hit, error: listErr } = await findContainerMeta()
        setContainer(hit)
        if (listErr && !hit) setError(listErr)
        // 详情失败不应阻断日志（例如容器刚被重建）
        void window.aiss.docker
          .inspect(sessionId, resourceId)
          .then(setDetail)
          .catch(() => setDetail(null))
        await fetchLogs()
      } else if (kind === 'swarm') {
        const d = await window.aiss.docker.swarmInspect(sessionId, resourceId)
        setSwarmDetail(d)
        await fetchLogs().catch((e) => {
          // 服务日志在部分环境不可用（如未启用日志驱动），不应挡住配置展示
          setHint(tg('ui.71', { 0: String(e instanceof Error ? e.message : String(e)) }))
        })
      } else {
        const r = await window.aiss.docker.composePs(sessionId, resourceId)
        setServices(r.services)
        if (r.error) setError(r.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [fetchLogs, findContainerMeta, kind, resourceId, sessionId])

  /** 仅刷新状态元数据（不重拉 inspect 配置），用于 follow / events */
  const refreshStatus = useCallback(async () => {
    try {
      if (kind === 'container') {
        const { hit } = await findContainerMeta()
        if (hit) setContainer(hit)
      } else if (kind === 'swarm') {
        const d = await window.aiss.docker.swarmInspect(sessionId, resourceId)
        setSwarmDetail(d)
      } else {
        const r = await window.aiss.docker.composePs(sessionId, resourceId)
        setServices(r.services)
      }
    } catch {
      /* 状态轮询失败保留旧数据 */
    }
  }, [findContainerMeta, kind, resourceId, sessionId])

  const filteredLogs = useMemo(() => {
    const q = logFilter.trim().toLowerCase()
    if (!logs) return { text: '', total: 0, matched: 0 }
    const lines = logs.split(/\r?\n/)
    if (!q) return { text: logs, total: lines.length, matched: lines.length }
    const matched = lines.filter((line) => line.toLowerCase().includes(q))
    return { text: matched.join('\n'), total: lines.length, matched: matched.length }
  }, [logFilter, logs])

  const allEnv = kind === 'swarm' ? (swarmDetail?.env ?? []) : (detail?.env ?? [])

  const visibleEnv = useMemo(() => {
    const q = envFilter.trim().toLowerCase()
    if (!q) return allEnv
    return allEnv.filter(
      (e) => e.key.toLowerCase().includes(q) || e.value.toLowerCase().includes(q)
    )
  }, [allEnv, envFilter])

  useEffect(() => {
    setDetail(null)
    setSwarmDetail(null)
    setShowSecrets(false)
    setEnvFilter('')
  }, [resourceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!follow) return
    const timer = window.setInterval(() => {
      if (kind !== 'compose') {
        void fetchLogs().catch((e) => {
          setError(e instanceof Error ? e.message : String(e))
        })
      }
      void refreshStatus()
    }, FOLLOW_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [fetchLogs, follow, kind, refreshStatus])

  /** 未开 follow 时仍周期刷新状态，避免启停后面板卡住 */
  useEffect(() => {
    if (follow) return
    const timer = window.setInterval(() => {
      void refreshStatus()
    }, 3000)
    return () => window.clearInterval(timer)
  }, [follow, refreshStatus])

  /** docker events：面板状态立刻跟上启停/扩缩 */
  useEffect(() => {
    return window.aiss.docker.onChanged((ev) => {
      if (ev.sessionId !== sessionId) return
      void refreshStatus()
    })
  }, [refreshStatus, sessionId])

  useEffect(() => {
    if (!follow || !stickToBottomRef.current) return
    const el = logsRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [filteredLogs.text, follow])

  const onLogsScroll = () => {
    const el = logsRef.current
    if (!el) return
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = dist < 40
  }

  const runContainerAction = async (action: DockerContainerAction) => {
    if (busyRef.current) return
    if (action === 'rm') {
      if (!(await confirmDialog({ title: tg('dlg.confirmTitle'), body: tg('ui.72', { 0: String(resourceName) }), danger: true, confirmText: tg('dlg.delete') }))) return
    }
    if (action === 'restart' && container?.swarmService) {
      if (
        !(await confirmDialog({
          title: tg('dlg.confirmTitle'),
          body: tg('ui.73', { 0: String(resourceName), 1: String(container.swarmService) }) + tg('ui.74'),
          confirmText: tg('dlg.restart')
        }))
      ) {
        return
      }
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    if (action === 'start' || action === 'restart') {
      setContainer((prev) =>
        prev
          ? { ...prev, state: 'starting', shortStatus: 'starting', status: tg('ui.75') }
          : {
              id: resourceId,
              name: resourceName,
              image: '',
              state: 'starting',
              status: tg('ui.75'),
              shortStatus: 'starting',
              ports: ''
            }
      )
    }
    try {
      await window.aiss.docker.containerAction(sessionId, resourceId, action)
      setHint(
        action === 'rm'
          ? tg('ui.76')
          : action === 'restart' && container?.swarmService
            ? tg('ui.77', { 0: String(container.swarmService) })
            : tg('ui.78', { 0: String(action) })
      )
      onTreeDirty?.()
      if (action === 'rm') {
        onClose()
        return
      }
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      await refresh().catch(() => undefined)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const runSwarmRestart = async () => {
    if (busyRef.current) return
    if (!(await confirmDialog({ title: tg('dlg.confirmTitle'), body: tg('ui.79', { 0: String(resourceName) }), confirmText: tg('dlg.restart') }))) {
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await window.aiss.docker.swarmAction(sessionId, resourceId, 'restart')
      setHint(tg('ui.80'))
      onTreeDirty?.()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const runSwarmScale = async () => {
    if (busyRef.current) return
    const current = swarmDetail?.replicas?.split('/')[1] ?? ''
    const input = await promptDialog({ title: tg('ui.81', { 0: String(resourceName) }), defaultValue: current })
    if (input === null) return
    const n = Number(input.trim())
    if (!Number.isInteger(n) || n < 0 || n > 512) {
      setError(tg('ui.82'))
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await window.aiss.docker.swarmAction(sessionId, resourceId, 'scale', n)
      setHint(tg('ui.83', { 0: String(n) }))
      onTreeDirty?.()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  const runComposeAction = async (action: DockerComposeAction) => {
    const label = action === 'up' ? 'up -d' : 'down'
    if (!(await confirmDialog({ title: tg('dlg.confirmTitle'), body: tg('ui.84', { 0: String(resourceName), 1: String(label) }), danger: action === 'down', confirmText: label }))) return
    setBusy(true)
    setError(null)
    try {
      await window.aiss.docker.composeAction(sessionId, resourceId, action)
      setHint(tg('ui.85', { 0: String(label) }))
      onTreeDirty?.()
      await refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const logsSection = (
    <>
      <div className="docker-logs-header">
        <h3 className="docker-section-title">{tg('ui.86')}</h3>
        <div className="docker-logs-toolbar">
          <input
            type="search"
            className="docker-log-filter"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            placeholder={tg('ui.87')}
            aria-label={tg('ui.88')}
          />
          {logFilter.trim() ? (
            <span className="docker-log-filter-count">
              {filteredLogs.matched}/{filteredLogs.total}
            </span>
          ) : null}
          <label className="docker-follow-toggle">
            <input
              type="checkbox"
              checked={follow}
              onChange={(e) => {
                const on = e.target.checked
                setFollow(on)
                if (on) {
                  stickToBottomRef.current = true
                  const el = logsRef.current
                  if (el) el.scrollTop = el.scrollHeight
                }
              }}
            />
            {tg('ui.89')}
          </label>
        </div>
      </div>
      <pre ref={logsRef} className="docker-logs" onScroll={onLogsScroll}>
        {filteredLogs.text || (logs ? tg('ui.90') : tg('ui.91'))}
      </pre>
    </>
  )

  // 配置显隐放在内容区标题行，不和启动/停止等操作按钮抢同一排
  const configToggle = (
    <button
      type="button"
      className={`docker-config-bar${showConfig ? ' is-open' : ''}`}
      aria-expanded={showConfig}
      title={tg('ui.92')}
      onClick={() => toggleShowConfig(!showConfig)}
    >
      <span className="docker-config-bar-chevron" aria-hidden>
        <Twist open={showConfig} />
      </span>
      <span className="docker-config-bar-title">{tg('ui.93')}</span>
      <span className="docker-config-bar-hint">{showConfig ? tg('ui.94') : tg('ui.95')}</span>
    </button>
  )

  return (
    <div className="workspace-panel workspace-panel--docker">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">
          {kind === 'container' ? tg('ui.96') : kind === 'swarm' ? tg('ui.97') : 'Compose'} ·{' '}
          {resourceName}
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={() => void refresh()} disabled={busy}>
            {tg('ui.98')}
          </button>
          {kind === 'container' ? (
            <>
              <button type="button" className="primary" disabled={busy} onClick={() => onOpenShell?.()}>
                {tg('ui.99')}
              </button>
              <button
                type="button"
                disabled={busy || Boolean(container?.swarmService)}
                title={container?.swarmService ? tg('ui.100') : undefined}
                onClick={() => void runContainerAction('start')}
              >
                {tg('ui.101')}
              </button>
              <button
                type="button"
                disabled={busy || Boolean(container?.swarmService)}
                title={container?.swarmService ? tg('ui.102') : undefined}
                onClick={() => void runContainerAction('stop')}
              >
                {tg('ui.103')}
              </button>
              <button type="button" disabled={busy} onClick={() => void runContainerAction('restart')}>
                {tg('ui.104')}
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy || Boolean(container?.swarmService)}
                title={container?.swarmService ? tg('ui.105') : undefined}
                onClick={() => void runContainerAction('rm')}
              >
                {tg('ui.8')}
              </button>
            </>
          ) : kind === 'swarm' ? (
            <>
              <button
                type="button"
                className="primary"
                disabled={busy}
                title={tg('ui.106')}
                onClick={() => void runSwarmRestart()}
              >
                {tg('ui.107')}
              </button>
              <button
                type="button"
                disabled={busy}
                title={tg('ui.108')}
                onClick={() => void runSwarmScale()}
              >
                {tg('ui.109')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="primary" disabled={busy} onClick={() => void runComposeAction('up')}>
                up -d
              </button>
              <button type="button" className="danger" disabled={busy} onClick={() => void runComposeAction('down')}>
                down
              </button>
            </>
          )}
          <button type="button" onClick={onClose} disabled={busy}>
            {tg('ui.27')}
          </button>
        </div>
      </div>
      <div
        className={`workspace-panel-body workspace-panel-body--docker${
          kind === 'compose' ? '' : ' workspace-panel-body--docker-logs'
        }`}
      >
        {error ? <p className="docker-panel-error">{error}</p> : null}
        {hint ? <p className="docker-panel-hint">{hint}</p> : null}

        {kind === 'container' ? (
          <>
            {configToggle}
            {showConfig ? (
              <div className="docker-config-block">
                <div className="docker-meta-grid">
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">{tg('ui.110')}</span>
                    <span className="docker-meta-value">
                      {container?.shortStatus === 'starting'
                        ? tg('ui.111', { 0: String(container.status ? tg('ui.112', { 0: String(container.status) }) : '') })
                        : container?.status || container?.shortStatus || '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">{tg('ui.113')}</span>
                    <span className="docker-meta-value is-mono" title={container?.image || ''}>
                      {container?.image || '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">{tg('ui.114')}</span>
                    <span className="docker-meta-value">
                      {container?.swarmService
                        ? `Swarm · ${container.swarmService}`
                        : container?.composeProject
                          ? `Compose · ${container.composeProject}`
                          : tg('ui.115')}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">{tg('ui.116')}</span>
                    <span className="docker-meta-value">{container?.createdAt || '—'}</span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">ID</span>
                    <span
                      className="docker-meta-value is-mono"
                      title={container?.id || resourceId}
                    >
                      {(container?.id || resourceId).slice(0, 12)}
                    </span>
                  </div>
                </div>

                {!detail ? (
                  <p className="docker-panel-muted">{tg('ui.117')}</p>
                ) : (
                  <div className="docker-detail-groups">
                    <EnvGroup
                      total={detail.env.length}
                      visible={visibleEnv}
                      filter={envFilter}
                      onFilter={setEnvFilter}
                      showSecrets={showSecrets}
                      onShowSecrets={setShowSecrets}
                    />

                    {detail.swarm ? (
                      <section className="docker-detail-group docker-detail-group--wide">
                        <header className="docker-detail-group-header">
                          <h4>
                            {tg('ui.118')}
                            <span className="docker-group-count">
                              {detail.swarm.publishedPorts.length}
                            </span>
                          </h4>
                          <span className="docker-detail-note">
                            {tg('ui.97')}{' '} {detail.swarm.service}
                          </span>
                        </header>
                        {detail.swarm.error ? (
                          <p className="docker-panel-muted">{detail.swarm.error}</p>
                        ) : (
                          <SwarmPortList ports={detail.swarm.publishedPorts} />
                        )}
                      </section>
                    ) : null}

                    <section className="docker-detail-group">
                      <header className="docker-detail-group-header">
                        <h4>
                          {tg('ui.119')}<span className="docker-group-count">{detail.ports.length}</span>
                        </h4>
                      </header>
                      {detail.ports.length === 0 ? (
                        <p className="docker-panel-muted">{tg('ui.61')}</p>
                      ) : (
                        <ul className="docker-detail-list">
                          {detail.ports.map((p, i) => (
                            <li key={`${p.container}-${p.hostIp ?? ''}-${p.hostPort ?? ''}-${i}`}>
                              {p.hostPort ? (
                                <>
                                  <code>
                                    {p.hostIp && p.hostIp !== '0.0.0.0' ? `${p.hostIp}:` : ''}
                                    {p.hostPort}
                                  </code>
                                  <span className="docker-detail-arrow" aria-hidden="true">
                                    →
                                  </span>
                                  <code>{p.container}</code>
                                </>
                              ) : (
                                <>
                                  <code>{p.container}</code>
                                  <span className="docker-detail-note">{tg('ui.120')}</span>
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="docker-detail-group">
                      <header className="docker-detail-group-header">
                        <h4>
                          {tg('ui.121')}<span className="docker-group-count">{detail.networks.length}</span>
                        </h4>
                      </header>
                      {detail.networks.length === 0 ? (
                        <p className="docker-panel-muted">{tg('ui.61')}</p>
                      ) : (
                        <ul className="docker-detail-list">
                          {detail.networks.map((n) => (
                            <li key={n.name}>
                              <code>{n.name}</code>
                              {n.ipAddress ? <span className="docker-detail-note">{n.ipAddress}</span> : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <MountGroup mounts={detail.mounts} />

                    <section className="docker-detail-group">
                      <header className="docker-detail-group-header">
                        <h4>{tg('ui.122')}</h4>
                      </header>
                      <dl className="docker-kv-list">
                        <div className="docker-kv-row">
                          <dt>{tg('ui.123')}</dt>
                          <dd>{detail.command || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.124')}</dt>
                          <dd>{detail.workingDir || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.125')}</dt>
                          <dd>{detail.user || tg('ui.126')}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.127')}</dt>
                          <dd>{detail.restartPolicy || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.128')}</dt>
                          <dd>{detail.health || tg('ui.129')}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.130')}</dt>
                          <dd>{detail.startedAt || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <LabelGroup title={tg('ui.131')} items={detail.labels} />
                  </div>
                )}
              </div>
            ) : null}

            {logsSection}
          </>
        ) : kind === 'swarm' ? (
          <>
            {configToggle}
            {showConfig ? (
              <div className="docker-config-block">
                <div className="docker-meta-grid">
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">{tg('ui.132')}</span>
                    <span className="docker-meta-value">
                      {swarmDetail ? tg('ui.133', { 0: String(swarmDetail.replicas), 1: String(swarmDetail.mode) }) : '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">{tg('ui.113')}</span>
                    <span className="docker-meta-value is-mono" title={swarmDetail?.image || ''}>
                      {swarmDetail?.image || '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">Stack</span>
                    <span className="docker-meta-value">{swarmDetail?.stack || tg('ui.134')}</span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">{tg('ui.135')}</span>
                    <span className="docker-meta-value" title={swarmDetail?.updatedAt || ''}>
                      {swarmDetail?.updatedAt || '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">ID</span>
                    <span className="docker-meta-value is-mono" title={swarmDetail?.id || ''}>
                      {(swarmDetail?.id || resourceId).slice(0, 12)}
                    </span>
                  </div>
                </div>

                {!swarmDetail ? (
                  <p className="docker-panel-muted">{tg('ui.136')}</p>
                ) : (
                  <div className="docker-detail-groups">
                    <section className="docker-detail-group docker-detail-group--wide">
                      <header className="docker-detail-group-header">
                        <h4>
                          {tg('ui.137')}
                          <span className="docker-group-count">{swarmDetail.ports.length}</span>
                        </h4>
                        <span className="docker-detail-note">
                          {tg('ui.138')}
                        </span>
                      </header>
                      <SwarmPortList ports={swarmDetail.ports} />
                    </section>

                    <EnvGroup
                      total={swarmDetail.env.length}
                      visible={visibleEnv}
                      filter={envFilter}
                      onFilter={setEnvFilter}
                      showSecrets={showSecrets}
                      onShowSecrets={setShowSecrets}
                    />

                    <section className="docker-detail-group">
                      <header className="docker-detail-group-header">
                        <h4>
                          {tg('ui.121')}<span className="docker-group-count">{swarmDetail.networks.length}</span>
                        </h4>
                      </header>
                      {swarmDetail.networks.length === 0 ? (
                        <p className="docker-panel-muted">{tg('ui.61')}</p>
                      ) : (
                        <ul className="docker-detail-list">
                          {swarmDetail.networks.map((n) => (
                            <li key={n}>
                              <code>{n}</code>
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <section className="docker-detail-group">
                      <header className="docker-detail-group-header">
                        <h4>{tg('ui.139')}</h4>
                      </header>
                      <dl className="docker-kv-list">
                        <div className="docker-kv-row">
                          <dt>{tg('ui.140')}</dt>
                          <dd>{swarmDetail.constraints.join(' · ') || tg('ui.61')}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.141')}</dt>
                          <dd>
                            {swarmDetail.resources?.limitCpu || '—'} /{' '}
                            {swarmDetail.resources?.reserveCpu || '—'}
                          </dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.142')}</dt>
                          <dd>
                            {swarmDetail.resources?.limitMemory || '—'} /{' '}
                            {swarmDetail.resources?.reserveMemory || '—'}
                          </dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.143')}</dt>
                          <dd>{swarmDetail.updatePolicy || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.127')}</dt>
                          <dd>{swarmDetail.restartPolicy || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <MountGroup mounts={swarmDetail.mounts} />

                    <section className="docker-detail-group">
                      <header className="docker-detail-group-header">
                        <h4>{tg('ui.122')}</h4>
                      </header>
                      <dl className="docker-kv-list">
                        <div className="docker-kv-row">
                          <dt>{tg('ui.123')}</dt>
                          <dd>{swarmDetail.command || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.124')}</dt>
                          <dd>{swarmDetail.workingDir || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.125')}</dt>
                          <dd>{swarmDetail.user || tg('ui.126')}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.128')}</dt>
                          <dd>{swarmDetail.healthcheck || tg('ui.129')}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.144')}</dt>
                          <dd>{swarmDetail.hosts.join(tg('ui.145')) || tg('ui.61')}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>{tg('ui.146')}</dt>
                          <dd>{swarmDetail.createdAt || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="docker-detail-group docker-detail-group--wide">
                      <header className="docker-detail-group-header">
                        <h4>
                          {tg('ui.147')}<span className="docker-group-count">{swarmDetail.tasks.length}</span>
                        </h4>
                        <span className="docker-detail-note">{tg('ui.148')}</span>
                      </header>
                      {swarmDetail.tasks.length === 0 ? (
                        <p className="docker-panel-muted">{tg('ui.61')}</p>
                      ) : (
                        <ul className="docker-detail-list is-scroll">
                          {swarmDetail.tasks.map((t) => (
                            <li key={t.id}>
                              <code>{t.name}</code>
                              <span className="docker-detail-note">{t.node || '—'}</span>
                              <span
                                className={`docker-task-state${
                                  /^running/i.test(t.currentState) ? ' is-running' : ''
                                }`}
                              >
                                {t.currentState}
                              </span>
                              {t.error ? (
                                <span className="docker-task-error" title={t.error}>
                                  {t.error}
                                </span>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                    </section>

                    <LabelGroup title={tg('ui.149')} items={swarmDetail.labels} />
                    <LabelGroup title={tg('ui.150')} items={swarmDetail.containerLabels} />
                  </div>
                )}
              </div>
            ) : null}

            {logsSection}
          </>
        ) : (
          <>
            <h3 className="docker-section-title">{tg('ui.151')}</h3>
            {services.length === 0 ? (
              <p className="docker-panel-muted">{tg('ui.152')}</p>
            ) : (
              <table className="docker-table">
                <thead>
                  <tr>
                    <th>{tg('ui.153')}</th>
                    <th>{tg('ui.110')}</th>
                    <th>ID</th>
                  </tr>
                </thead>
                <tbody>
                  {services.map((s) => (
                    <tr key={s.id || s.name}>
                      <td>{s.name}</td>
                      <td>{s.shortStatus || s.status || s.state}</td>
                      <td>
                        <code>{s.id ? s.id.slice(0, 12) : '—'}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
