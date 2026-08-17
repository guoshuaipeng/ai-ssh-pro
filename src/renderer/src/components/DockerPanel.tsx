import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DockerComposeService,
  DockerContainer,
  DockerContainerAction,
  DockerComposeAction
} from '@shared/ipc'

type Props = {
  sessionId: string
  kind: 'container' | 'compose'
  resourceId: string
  resourceName: string
  onClose: () => void
  onTreeDirty?: () => void
  onOpenShell?: () => void
}

const LOG_TAIL = 400
const FOLLOW_INTERVAL_MS = 2000

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
    return { hit: null, error: tree.containersError }
  }, [resourceId, resourceName, sessionId])

  const fetchLogs = useCallback(async () => {
    const text = await window.aiss.docker.logs(sessionId, resourceId, LOG_TAIL)
    setLogs(text)
  }, [resourceId, sessionId])

  const refresh = useCallback(async () => {
    setError(null)
    setHint(null)
    try {
      if (kind === 'container') {
        const { hit, error: listErr } = await findContainerMeta()
        setContainer(hit)
        if (listErr && !hit) setError(listErr)
        await fetchLogs()
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

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (kind !== 'container' || !follow) return
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

  return (
    <div className="workspace-panel workspace-panel--docker">
      <div className="workspace-panel-toolbar">
        <h2 className="workspace-panel-title">
          {kind === 'container' ? '容器' : 'Compose'} · {resourceName}
        </h2>
        <div className="workspace-panel-actions">
          <button type="button" onClick={() => void refresh()} disabled={busy}>
            刷新
          </button>
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
          kind === 'container' ? ' workspace-panel-body--docker-logs' : ''
        }`}
      >
        {error ? <p className="docker-panel-error">{error}</p> : null}
        {hint ? <p className="docker-panel-hint">{hint}</p> : null}

        {kind === 'container' ? (
          <>
            <div className="docker-meta-grid">
              <div>
                <span className="docker-meta-label">ID</span>
                <code>{container?.id || resourceId}</code>
              </div>
              <div>
                <span className="docker-meta-label">编排</span>
                <span>
                  {container?.swarmService
                    ? `Swarm · ${container.swarmService}`
                    : container?.composeProject
                      ? `Compose · ${container.composeProject}`
                      : '普通容器'}
                </span>
              </div>
              <div>
                <span className="docker-meta-label">状态</span>
                <span>
                  {container?.shortStatus === 'starting'
                    ? `启动中${container.status ? `（${container.status}）` : ''}`
                    : container?.status || container?.shortStatus || '—'}
                </span>
              </div>
              <div>
                <span className="docker-meta-label">镜像</span>
                <span>{container?.image || '—'}</span>
              </div>
              <div>
                <span className="docker-meta-label">端口</span>
                <span>{container?.ports || '—'}</span>
              </div>
              <div>
                <span className="docker-meta-label">创建</span>
                <span>{container?.createdAt || '—'}</span>
              </div>
            </div>
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
