import { useMemo } from 'react'
import type { MouseEvent } from 'react'
import type {
  DockerComposeProject,
  DockerContainer,
  DockerSwarmService,
  DockerSwarmStack,
  DockerTreeResult,
  SavedSessionProfile
} from '@shared/ipc'
import { normalizeQuery, profileMatches } from '../lib/session-filter'

export type DockerTreeCache = {
  status: 'idle' | 'connecting' | 'loading' | 'ready' | 'error'
  data?: DockerTreeResult
  error?: string
  sessionId?: string
}

type Props = {
  profile: SavedSessionProfile
  selected: boolean
  hostExpanded: boolean
  composeExpanded: boolean
  swarmExpanded: boolean
  containersExpanded: boolean
  isComposeProjectExpanded: (projectName: string) => boolean
  isSwarmNodeExpanded: (key: string) => boolean
  tree: DockerTreeCache | undefined
  onSelect: () => void
  onConnect: () => void
  onContextMenu: (e: MouseEvent) => void
  onToggleHost: () => void
  onToggleCompose: () => void
  onToggleSwarm: () => void
  onToggleContainers: () => void
  onToggleComposeProject: (projectName: string) => void
  onToggleSwarmNode: (key: string) => void
  onRefresh: () => void
  onOpenContainer: (id: string, name: string) => void
  onOpenCompose: (name: string) => void
  onOpenSwarmService: (name: string) => void
  inFolder?: boolean
  /** 侧栏搜索词：非空时只显示命中的容器，并自动展开 */
  searchQuery?: string
}

type StatusTone = 'running' | 'healthy' | 'unhealthy' | 'starting' | 'exited' | 'other'

function toneFromStatus(shortStatus?: string, status?: string): StatusTone {
  const s = `${shortStatus || ''} ${status || ''}`.toLowerCase()
  if (/\bunhealthy\b/.test(s)) return 'unhealthy'
  if (/\bhealthy\b/.test(s)) return 'healthy'
  if (/\bstarting\b|\brestarting\b|\bcreated\b|\bhealth:\s*starting\b/.test(s)) return 'starting'
  if (/\brunning\b/.test(s)) return 'running'
  if (/\bexited\b|\bstopped\b|\bdead\b|\bpaused\b/.test(s)) return 'exited'
  return 'other'
}

function statusLabel(shortStatus?: string, status?: string): string {
  const tone = toneFromStatus(shortStatus, status)
  if (tone === 'starting') return status?.trim() || '启动中'
  return status || shortStatus || tone
}

function StatusIcon({ tone, title }: { tone: StatusTone; title?: string }) {
  return (
    <span
      className={`docker-status-icon docker-status-icon--${tone}`}
      title={title || tone}
      aria-label={title || tone}
      role="img"
    />
  )
}

export default function SessionDockerBranch({
  profile,
  selected,
  hostExpanded,
  composeExpanded,
  swarmExpanded,
  containersExpanded,
  isComposeProjectExpanded,
  isSwarmNodeExpanded,
  tree,
  onSelect,
  onConnect,
  onContextMenu,
  onToggleHost,
  onToggleCompose,
  onToggleSwarm,
  onToggleContainers,
  onToggleComposeProject,
  onToggleSwarmNode,
  onRefresh,
  onOpenContainer,
  onOpenCompose,
  onOpenSwarmService,
  inFolder,
  searchQuery = ''
}: Props) {
  const label = profile.label?.trim() || profile.host || `${profile.username}@${profile.host}`
  const busy = tree?.status === 'connecting' || tree?.status === 'loading'

  // 搜索词命中主机自身时不过滤其下容器，否则展示该主机命中的容器
  const q = profileMatches(profile, normalizeQuery(searchQuery)) ? '' : normalizeQuery(searchQuery)
  const hit = (v?: string) => Boolean(v && v.toLowerCase().includes(q))

  const view = useMemo(() => {
    const data = tree?.data
    const empty = {
      containers: [] as DockerContainer[],
      projects: [] as DockerComposeProject[],
      stacks: [] as DockerSwarmStack[]
    }
    if (!data) return empty
    if (!q) {
      return { containers: data.containers, projects: data.composeProjects, stacks: data.swarm.stacks }
    }
    const containers = data.containers.filter((c) => hit(c.name) || hit(c.image))
    const projects = data.composeProjects
      .map((p) => {
        if (hit(p.name)) return p
        const kids = p.containers.filter((c) => hit(c.name) || hit(c.composeService) || hit(c.image))
        return kids.length > 0 ? { ...p, containers: kids } : null
      })
      .filter(Boolean) as DockerComposeProject[]
    const stacks = data.swarm.stacks
      .map((stack) => {
        if (hit(stack.name)) return stack
        const services = stack.services.filter(
          (s) => hit(s.name) || hit(s.image) || s.containers.some((c) => hit(c.name))
        )
        return services.length > 0 ? { ...stack, services } : null
      })
      .filter(Boolean) as DockerSwarmStack[]
    return { containers, projects, stacks }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, tree?.data])

  const standaloneCount = view.containers.length
  const swarmCount = view.stacks.reduce((n, s) => n + s.services.length, 0)
  const swarmInfo = tree?.data?.swarm
  // 搜索时强制展开，让命中的容器直接可见
  const searching = q.length > 0
  const showCompose = searching ? view.projects.length > 0 : composeExpanded
  const showSwarm = searching ? swarmCount > 0 : swarmExpanded
  const showContainers = searching ? standaloneCount > 0 : containersExpanded
  // 仅在主机已展开时显示树；首次加载完成前不展开，故不会闪空树
  const showTree =
    hostExpanded || (searching && (view.projects.length > 0 || swarmCount > 0 || standaloneCount > 0))

  const renderSwarmService = (svc: DockerSwarmService, nested: boolean) => {
    const tone = toneFromStatus(svc.shortStatus)
    const open = searching || isSwarmNodeExpanded(`svc:${svc.name}`)
    const published = svc.ports.filter((p) => p.publishedPort)
    return (
      <div
        key={svc.id}
        className={`session-docker-project${nested ? ' session-docker-project--nested' : ''}`}
      >
        <div className="session-docker-project-row">
          <button
            type="button"
            className="session-docker-chevron-btn"
            title={open ? '折叠任务容器' : '展开任务容器'}
            disabled={svc.containers.length === 0}
            onClick={() => onToggleSwarmNode(`svc:${svc.name}`)}
          >
            {svc.containers.length === 0 ? '·' : open ? '▼' : '▶'}
          </button>
          <button
            type="button"
            className="session-docker-leaf session-docker-leaf--project"
            title={`${svc.image}\n副本 ${svc.replicas}${
              published.length > 0
                ? `\n发布端口 ${published
                    .map((p) => `${p.publishedPort}→${p.targetPort}/${p.protocol}`)
                    .join(', ')}`
                : '\n未发布端口'
            }`}
            onClick={() => onOpenSwarmService(svc.name)}
          >
            <StatusIcon tone={tone} title={`副本 ${svc.replicas}`} />
            <span className="session-docker-leaf-name">{svc.name}</span>
            {published.length > 0 ? (
              <span className="session-docker-port-badge">
                :{published[0].publishedPort}
                {published.length > 1 ? `+${published.length - 1}` : ''}
              </span>
            ) : null}
            <span className="session-docker-count">{svc.replicas}</span>
          </button>
        </div>
        {open && svc.containers.length > 0 ? (
          <div className="session-docker-project-children">
            {svc.containers.map((c) => {
              const ct = toneFromStatus(c.shortStatus, c.status)
              return (
                <button
                  key={c.id}
                  type="button"
                  className="session-docker-leaf"
                  title={`${c.name}\n${c.image}\n${c.status}`}
                  onClick={() => onOpenContainer(c.id, c.name)}
                >
                  <StatusIcon tone={ct} title={statusLabel(c.shortStatus, c.status)} />
                  <span className="session-docker-leaf-name">
                    {/* 任务容器名形如 svc.1.xxxxx，去掉服务名前缀更好读 */}
                    {c.name.startsWith(`${svc.name}.`) ? c.name.slice(svc.name.length + 1) : c.name}
                  </span>
                  {ct === 'starting' ? (
                    <span className="session-docker-leaf-badge">启动中</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className={`session-host-block${inFolder ? ' session-host-block--in-folder' : ''}`}>
      <div
        className={`profile-row profile-row--host${selected ? ' is-selected' : ''}${inFolder ? ' profile-row--in-folder' : ''}${busy && !hostExpanded ? ' is-docker-loading' : ''}`}
        title={`${profile.username}@${profile.host}:${profile.port} · 单击选中 · 双击连接 · 右键可展开 Docker`}
        onClick={onSelect}
        onDoubleClick={onConnect}
        onContextMenu={onContextMenu}
      >
        <button
          type="button"
          className="session-host-chevron"
          title={
            busy && !hostExpanded
              ? '正在加载 Docker…'
              : hostExpanded
                ? '折叠'
                : '展开 Docker（自动连接）'
          }
          aria-label={hostExpanded ? '折叠' : '展开'}
          disabled={busy && !hostExpanded}
          onClick={(e) => {
            e.stopPropagation()
            onToggleHost()
          }}
        >
          {busy && !hostExpanded ? (
            <span className="session-host-spinner" aria-hidden />
          ) : hostExpanded ? (
            '▼'
          ) : (
            '▶'
          )}
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
        </div>
        {hostExpanded ? (
          <button
            type="button"
            className="session-host-refresh"
            title="刷新 Docker"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              onRefresh()
            }}
          >
            {busy ? <span className="session-host-spinner" aria-hidden /> : '↻'}
          </button>
        ) : null}
      </div>

      {showTree ? (
        <div className="session-docker-tree">
          {tree?.status === 'error' ? (
            <div className="session-docker-msg session-docker-msg--error">{tree.error || '加载失败'}</div>
          ) : null}
          {tree?.status === 'ready' && tree.data ? (
            <>
              <div className="session-docker-group">
                <button type="button" className="session-docker-group-row" onClick={onToggleCompose}>
                  <span className="session-docker-chevron" aria-hidden>
                    {showCompose ? '▼' : '▶'}
                  </span>
                  <span className="session-docker-group-icon" aria-hidden>
                    ▦
                  </span>
                  <span className="session-docker-group-name">Docker-compose</span>
                  <span className="session-docker-count">{view.projects.length}</span>
                </button>
                {showCompose ? (
                  <div className="session-docker-children">
                    {tree.data.composeError ? (
                      <div className="session-docker-msg session-docker-msg--error">{tree.data.composeError}</div>
                    ) : view.projects.length === 0 ? (
                      <div className="session-docker-msg">{searching ? '无匹配项目' : '无 compose 项目'}</div>
                    ) : (
                      view.projects.map((p) => {
                        const tone = toneFromStatus(undefined, p.status)
                        const open = searching || isComposeProjectExpanded(p.name)
                        return (
                          <div key={p.name} className="session-docker-project">
                            <div className="session-docker-project-row">
                              <button
                                type="button"
                                className="session-docker-chevron-btn"
                                title={open ? '折叠容器' : '展开容器'}
                                onClick={() => onToggleComposeProject(p.name)}
                              >
                                {open ? '▼' : '▶'}
                              </button>
                              <button
                                type="button"
                                className="session-docker-leaf session-docker-leaf--project"
                                title={p.status || p.configFiles || p.name}
                                onClick={() => onOpenCompose(p.name)}
                              >
                                <StatusIcon tone={tone} title={statusLabel(undefined, p.status)} />
                                <span className="session-docker-leaf-name">{p.name}</span>
                                <span className="session-docker-count">{p.containers.length}</span>
                              </button>
                            </div>
                            {open ? (
                              <div className="session-docker-project-children">
                                {p.containers.length === 0 ? (
                                  <div className="session-docker-msg">无容器</div>
                                ) : (
                                  p.containers.map((c) => {
                                    const ct = toneFromStatus(c.shortStatus, c.status)
                                    return (
                                      <button
                                        key={c.id}
                                        type="button"
                                        className="session-docker-leaf"
                                        title={`${c.image}\n${c.status}`}
                                        onClick={() => onOpenContainer(c.id, c.name)}
                                      >
                                        <StatusIcon tone={ct} title={statusLabel(c.shortStatus, c.status)} />
                                        <span className="session-docker-leaf-name">
                                          {c.composeService || c.name}
                                        </span>
                                        {ct === 'starting' ? (
                                          <span className="session-docker-leaf-badge">启动中</span>
                                        ) : null}
                                      </button>
                                    )
                                  })
                                )}
                              </div>
                            ) : null}
                          </div>
                        )
                      })
                    )}
                  </div>
                ) : null}
              </div>

              {swarmInfo?.active ? (
                <div className="session-docker-group">
                  <button type="button" className="session-docker-group-row" onClick={onToggleSwarm}>
                    <span className="session-docker-chevron" aria-hidden>
                      {showSwarm ? '▼' : '▶'}
                    </span>
                    <span className="session-docker-group-icon" aria-hidden>
                      ⬢
                    </span>
                    <span className="session-docker-group-name">Docker-swarm</span>
                    <span className="session-docker-count">{swarmCount}</span>
                  </button>
                  {showSwarm ? (
                    <div className="session-docker-children">
                      {swarmInfo.error ? (
                        <div className="session-docker-msg session-docker-msg--error">
                          {swarmInfo.error}
                        </div>
                      ) : swarmCount === 0 ? (
                        <div className="session-docker-msg">
                          {searching ? '无匹配服务' : '无 Swarm 服务'}
                        </div>
                      ) : (
                        view.stacks.map((stack) => {
                          const services = stack.services.map((s) =>
                            renderSwarmService(s, Boolean(stack.name))
                          )
                          // 未用 stack deploy 的服务不套一层无名节点
                          if (!stack.name) return <div key="__nostack">{services}</div>
                          const open = searching || isSwarmNodeExpanded(`stack:${stack.name}`)
                          return (
                            <div key={stack.name} className="session-docker-project">
                              <div className="session-docker-project-row">
                                <button
                                  type="button"
                                  className="session-docker-chevron-btn"
                                  title={open ? '折叠服务' : '展开服务'}
                                  onClick={() => onToggleSwarmNode(`stack:${stack.name}`)}
                                >
                                  {open ? '▼' : '▶'}
                                </button>
                                <span className="session-docker-leaf session-docker-leaf--project">
                                  <span className="session-docker-group-icon" aria-hidden>
                                    ▤
                                  </span>
                                  <span className="session-docker-leaf-name">{stack.name}</span>
                                  <span className="session-docker-count">{stack.services.length}</span>
                                </span>
                              </div>
                              {open ? (
                                <div className="session-docker-project-children">{services}</div>
                              ) : null}
                            </div>
                          )
                        })
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="session-docker-group">
                <button type="button" className="session-docker-group-row" onClick={onToggleContainers}>
                  <span className="session-docker-chevron" aria-hidden>
                    {showContainers ? '▼' : '▶'}
                  </span>
                  <span className="session-docker-group-icon" aria-hidden>
                    ▣
                  </span>
                  <span className="session-docker-group-name">Containers</span>
                  <span className="session-docker-count">{standaloneCount}</span>
                </button>
                {showContainers ? (
                  <div className="session-docker-children">
                    {tree.data.containersError ? (
                      <div className="session-docker-msg session-docker-msg--error">{tree.data.containersError}</div>
                    ) : standaloneCount === 0 ? (
                      <div className="session-docker-msg">
                        {searching ? '无匹配容器' : '无独立容器（compose 内容已归入上方）'}
                      </div>
                    ) : (
                      view.containers.map((c) => {
                        const ct = toneFromStatus(c.shortStatus, c.status)
                        return (
                          <button
                            key={c.id}
                            type="button"
                            className="session-docker-leaf"
                            title={`${c.image}\n${c.status}`}
                            onClick={() => onOpenContainer(c.id, c.name)}
                          >
                            <StatusIcon tone={ct} title={statusLabel(c.shortStatus, c.status)} />
                            <span className="session-docker-leaf-name">{c.name}</span>
                            {ct === 'starting' ? (
                              <span className="session-docker-leaf-badge">启动中</span>
                            ) : null}
                          </button>
                        )
                      })
                    )}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
