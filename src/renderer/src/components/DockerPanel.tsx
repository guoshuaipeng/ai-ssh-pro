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
          环境变量
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
            placeholder="过滤变量…"
            aria-label="过滤环境变量"
          />
          <label className="docker-secret-toggle">
            <input
              type="checkbox"
              checked={showSecrets}
              onChange={(e) => onShowSecrets(e.target.checked)}
            />
            显示敏感值
          </label>
        </div>
      </header>
      {visible.length === 0 ? (
        <p className="docker-panel-muted">{total === 0 ? '无' : '无匹配项'}</p>
      ) : (
        <dl className="docker-kv-list is-scroll">
          {visible.map((item) => {
            const masked = !showSecrets && SENSITIVE_ENV_KEY.test(item.key) && item.value !== ''
            return (
              <div key={item.key} className="docker-kv-row">
                <dt title={item.key}>{item.key}</dt>
                <dd className={masked ? 'is-masked' : undefined}>
                  {masked ? maskValue(item.value) : item.value || <em>（空）</em>}
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
        <p className="docker-panel-muted">无</p>
      ) : (
        <dl className="docker-kv-list is-scroll">
          {items.map((item) => (
            <div key={item.key} className="docker-kv-row">
              <dt title={item.key}>{item.key}</dt>
              <dd>{item.value || <em>（空）</em>}</dd>
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
          挂载卷<span className="docker-group-count">{mounts.length}</span>
        </h4>
      </header>
      {mounts.length === 0 ? (
        <p className="docker-panel-muted">无</p>
      ) : (
        <ul className="docker-detail-list is-scroll">
          {mounts.map((m, i) => (
            <li key={`${m.destination}-${i}`}>
              <code>{m.source || `（匿名 ${m.type}）`}</code>
              <span className="docker-detail-arrow" aria-hidden="true">
                →
              </span>
              <code>{m.destination}</code>
              <span className="docker-detail-note">{m.readWrite ? '读写' : '只读'}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** 服务级发布端口：宿主机端口 → 容器端口，并标注 ingress / host 模式 */
function SwarmPortList({ ports }: { ports: DockerSwarmPort[] }) {
  if (ports.length === 0) return <p className="docker-panel-muted">未发布端口</p>
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
            {p.publishMode === 'host' ? 'host 模式（仅所在节点）' : 'ingress（集群任意节点可达）'}
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
          setHint(`日志不可用：${e instanceof Error ? e.message : String(e)}`)
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
    if (kind === 'compose' || !follow) return
    const timer = window.setInterval(() => {
      void fetchLogs().catch((e) => {
        setError(e instanceof Error ? e.message : String(e))
      })
    }, FOLLOW_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [fetchLogs, follow, kind])

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
      if (!window.confirm(`确定删除容器「${resourceName}」？此操作不可恢复。`)) return
    }
    if (action === 'restart' && container?.swarmService) {
      if (
        !window.confirm(
          `「${resourceName}」是 Swarm 服务「${container.swarmService}」的任务。\n` +
            `将执行 docker service update --force（由 Swarm 重建任务），而不是 docker restart。\n继续？`
        )
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
          ? { ...prev, state: 'starting', shortStatus: 'starting', status: '启动中…' }
          : {
              id: resourceId,
              name: resourceName,
              image: '',
              state: 'starting',
              status: '启动中…',
              shortStatus: 'starting',
              ports: ''
            }
      )
    }
    try {
      await window.aiss.docker.containerAction(sessionId, resourceId, action)
      setHint(
        action === 'rm'
          ? '已删除'
          : action === 'restart' && container?.swarmService
            ? `已触发 Swarm 服务重建：${container.swarmService}`
            : `已执行 ${action}`
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
    if (
      !window.confirm(
        `确定重启 Swarm 服务「${resourceName}」？\n将执行 docker service update --force，由 Swarm 逐个重建任务。`
      )
    ) {
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await window.aiss.docker.swarmAction(sessionId, resourceId, 'restart')
      setHint('已触发服务重建（update --force）')
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
    const input = window.prompt(`将服务「${resourceName}」的副本数调整为：`, current)
    if (input === null) return
    const n = Number(input.trim())
    if (!Number.isInteger(n) || n < 0 || n > 512) {
      setError('副本数需为 0–512 的整数')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await window.aiss.docker.swarmAction(sessionId, resourceId, 'scale', n)
      setHint(`已调整副本数为 ${n}`)
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
    if (!window.confirm(`确定对 compose 项目「${resourceName}」执行 ${label}？`)) return
    setBusy(true)
    setError(null)
    try {
      await window.aiss.docker.composeAction(sessionId, resourceId, action)
      setHint(`已执行 compose ${label}`)
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
        <h3 className="docker-section-title">日志</h3>
        <div className="docker-logs-toolbar">
          <input
            type="search"
            className="docker-log-filter"
            value={logFilter}
            onChange={(e) => setLogFilter(e.target.value)}
            placeholder="过滤关键字…"
            aria-label="日志过滤"
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
            自动滚动更新
          </label>
        </div>
      </div>
      <pre ref={logsRef} className="docker-logs" onScroll={onLogsScroll}>
        {filteredLogs.text || (logs ? '（无匹配行）' : '（无输出）')}
      </pre>
    </>
  )

  return (
    <div className="workspace-panel workspace-panel--docker">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">
          {kind === 'container' ? '容器' : kind === 'swarm' ? 'Swarm 服务' : 'Compose'} ·{' '}
          {resourceName}
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={() => void refresh()} disabled={busy}>
            刷新
          </button>
          {kind === 'container' || kind === 'swarm' ? (
            <label className="docker-config-toggle" title="记住选择，所有容器与 Swarm 服务共用">
              <input
                type="checkbox"
                checked={showConfig}
                onChange={(e) => toggleShowConfig(e.target.checked)}
              />
              显示配置
            </label>
          ) : null}
          {kind === 'container' ? (
            <>
              <button type="button" className="primary" disabled={busy} onClick={() => onOpenShell?.()}>
                进入容器
              </button>
              <button
                type="button"
                disabled={busy || Boolean(container?.swarmService)}
                title={container?.swarmService ? 'Swarm 任务请用「重启」（service update），勿直接启动' : undefined}
                onClick={() => void runContainerAction('start')}
              >
                启动
              </button>
              <button
                type="button"
                disabled={busy || Boolean(container?.swarmService)}
                title={container?.swarmService ? 'Swarm 任务请勿直接停止，可用 service scale=0' : undefined}
                onClick={() => void runContainerAction('stop')}
              >
                停止
              </button>
              <button type="button" disabled={busy} onClick={() => void runContainerAction('restart')}>
                重启
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy || Boolean(container?.swarmService)}
                title={container?.swarmService ? 'Swarm 任务请勿直接删除' : undefined}
                onClick={() => void runContainerAction('rm')}
              >
                删除
              </button>
            </>
          ) : kind === 'swarm' ? (
            <>
              <button
                type="button"
                className="primary"
                disabled={busy}
                title="docker service update --force：由 Swarm 逐个重建任务"
                onClick={() => void runSwarmRestart()}
              >
                重启服务
              </button>
              <button
                type="button"
                disabled={busy}
                title="docker service scale：调整副本数（设为 0 即停服）"
                onClick={() => void runSwarmScale()}
              >
                副本数…
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
            关闭
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
            {showConfig ? (
              <div className="docker-config-block">
                <div className="docker-meta-grid">
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">状态</span>
                    <span className="docker-meta-value">
                      {container?.shortStatus === 'starting'
                        ? `启动中${container.status ? `（${container.status}）` : ''}`
                        : container?.status || container?.shortStatus || '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">镜像</span>
                    <span className="docker-meta-value is-mono" title={container?.image || ''}>
                      {container?.image || '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">编排</span>
                    <span className="docker-meta-value">
                      {container?.swarmService
                        ? `Swarm · ${container.swarmService}`
                        : container?.composeProject
                          ? `Compose · ${container.composeProject}`
                          : '普通容器'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">创建</span>
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
                  <p className="docker-panel-muted">读取配置中…</p>
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
                            服务发布端口
                            <span className="docker-group-count">
                              {detail.swarm.publishedPorts.length}
                            </span>
                          </h4>
                          <span className="docker-detail-note">
                            Swarm 服务 {detail.swarm.service}
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
                          容器端口<span className="docker-group-count">{detail.ports.length}</span>
                        </h4>
                      </header>
                      {detail.ports.length === 0 ? (
                        <p className="docker-panel-muted">无</p>
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
                                  <span className="docker-detail-note">未映射</span>
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
                          网络<span className="docker-group-count">{detail.networks.length}</span>
                        </h4>
                      </header>
                      {detail.networks.length === 0 ? (
                        <p className="docker-panel-muted">无</p>
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
                        <h4>运行配置</h4>
                      </header>
                      <dl className="docker-kv-list">
                        <div className="docker-kv-row">
                          <dt>命令</dt>
                          <dd>{detail.command || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>工作目录</dt>
                          <dd>{detail.workingDir || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>用户</dt>
                          <dd>{detail.user || '默认'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>重启策略</dt>
                          <dd>{detail.restartPolicy || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>健康检查</dt>
                          <dd>{detail.health || '未配置'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>启动时间</dt>
                          <dd>{detail.startedAt || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <LabelGroup title="标签" items={detail.labels} />
                  </div>
                )}
              </div>
            ) : null}

            {logsSection}
          </>
        ) : kind === 'swarm' ? (
          <>
            {showConfig ? (
              <div className="docker-config-block">
                <div className="docker-meta-grid">
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">副本</span>
                    <span className="docker-meta-value">
                      {swarmDetail ? `${swarmDetail.replicas}（${swarmDetail.mode}）` : '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">镜像</span>
                    <span className="docker-meta-value is-mono" title={swarmDetail?.image || ''}>
                      {swarmDetail?.image || '—'}
                    </span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">Stack</span>
                    <span className="docker-meta-value">{swarmDetail?.stack || '（未归属）'}</span>
                  </div>
                  <div className="docker-meta-item">
                    <span className="docker-meta-label">最近更新</span>
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
                  <p className="docker-panel-muted">读取服务配置中…</p>
                ) : (
                  <div className="docker-detail-groups">
                    <section className="docker-detail-group docker-detail-group--wide">
                      <header className="docker-detail-group-header">
                        <h4>
                          发布端口
                          <span className="docker-group-count">{swarmDetail.ports.length}</span>
                        </h4>
                        <span className="docker-detail-note">
                          端口在服务层发布，任务容器内看不到映射
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
                          网络<span className="docker-group-count">{swarmDetail.networks.length}</span>
                        </h4>
                      </header>
                      {swarmDetail.networks.length === 0 ? (
                        <p className="docker-panel-muted">无</p>
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
                        <h4>调度与资源</h4>
                      </header>
                      <dl className="docker-kv-list">
                        <div className="docker-kv-row">
                          <dt>放置约束</dt>
                          <dd>{swarmDetail.constraints.join(' · ') || '无'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>CPU 限制 / 预留</dt>
                          <dd>
                            {swarmDetail.resources?.limitCpu || '—'} /{' '}
                            {swarmDetail.resources?.reserveCpu || '—'}
                          </dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>内存 限制 / 预留</dt>
                          <dd>
                            {swarmDetail.resources?.limitMemory || '—'} /{' '}
                            {swarmDetail.resources?.reserveMemory || '—'}
                          </dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>更新策略</dt>
                          <dd>{swarmDetail.updatePolicy || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>重启策略</dt>
                          <dd>{swarmDetail.restartPolicy || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <MountGroup mounts={swarmDetail.mounts} />

                    <section className="docker-detail-group">
                      <header className="docker-detail-group-header">
                        <h4>运行配置</h4>
                      </header>
                      <dl className="docker-kv-list">
                        <div className="docker-kv-row">
                          <dt>命令</dt>
                          <dd>{swarmDetail.command || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>工作目录</dt>
                          <dd>{swarmDetail.workingDir || '—'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>用户</dt>
                          <dd>{swarmDetail.user || '默认'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>健康检查</dt>
                          <dd>{swarmDetail.healthcheck || '未配置'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>额外 hosts</dt>
                          <dd>{swarmDetail.hosts.join('，') || '无'}</dd>
                        </div>
                        <div className="docker-kv-row">
                          <dt>创建时间</dt>
                          <dd>{swarmDetail.createdAt || '—'}</dd>
                        </div>
                      </dl>
                    </section>

                    <section className="docker-detail-group docker-detail-group--wide">
                      <header className="docker-detail-group-header">
                        <h4>
                          任务<span className="docker-group-count">{swarmDetail.tasks.length}</span>
                        </h4>
                        <span className="docker-detail-note">含历史任务，按时间倒序</span>
                      </header>
                      {swarmDetail.tasks.length === 0 ? (
                        <p className="docker-panel-muted">无</p>
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

                    <LabelGroup title="服务标签" items={swarmDetail.labels} />
                    <LabelGroup title="容器标签" items={swarmDetail.containerLabels} />
                  </div>
                )}
              </div>
            ) : null}

            {logsSection}
          </>
        ) : (
          <>
            <h3 className="docker-section-title">服务 / 容器</h3>
            {services.length === 0 ? (
              <p className="docker-panel-muted">暂无服务（或项目未启动）</p>
            ) : (
              <table className="docker-table">
                <thead>
                  <tr>
                    <th>名称</th>
                    <th>状态</th>
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
