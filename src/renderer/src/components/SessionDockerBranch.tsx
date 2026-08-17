import type { MouseEvent } from 'react'
import type { DockerTreeResult, SavedSessionProfile } from '@shared/ipc'

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
  containersExpanded: boolean
  isComposeProjectExpanded: (projectName: string) => boolean
  tree: DockerTreeCache | undefined
  onSelect: () => void
  onConnect: () => void
  onContextMenu: (e: MouseEvent) => void
  onToggleHost: () => void
  onToggleCompose: () => void
  onToggleContainers: () => void
  onToggleComposeProject: (projectName: string) => void
  onRefresh: () => void
  onOpenContainer: (id: string, name: string) => void
  onOpenCompose: (name: string) => void
  inFolder?: boolean
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
  containersExpanded,
  isComposeProjectExpanded,
  tree,
  onSelect,
  onConnect,
  onContextMenu,
  onToggleHost,
  onToggleCompose,
  onToggleContainers,
  onToggleComposeProject,
  onRefresh,
  onOpenContainer,
  onOpenCompose,
  inFolder
}: Props) {
  const label = profile.label?.trim() || profile.host || `${profile.username}@${profile.host}`
  const busy = tree?.status === 'connecting' || tree?.status === 'loading'
  const standaloneCount = tree?.data?.containers.length ?? 0
  // 仅在主机已展开时显示树；首次加载完成前不展开，故不会闪空树
  const showTree = hostExpanded

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
                    {composeExpanded ? '▼' : '▶'}
                  </span>
                  <span className="session-docker-group-icon" aria-hidden>
                    ▦
                  </span>
                  <span className="session-docker-group-name">Docker-compose</span>
                  <span className="session-docker-count">{tree.data.composeProjects.length}</span>
                </button>
                {composeExpanded ? (
                  <div className="session-docker-children">
                    {tree.data.composeError ? (
                      <div className="session-docker-msg session-docker-msg--error">{tree.data.composeError}</div>
                    ) : tree.data.composeProjects.length === 0 ? (
                      <div className="session-docker-msg">无 compose 项目</div>
                    ) : (
                      tree.data.composeProjects.map((p) => {
                        const tone = toneFromStatus(undefined, p.status)
                        const open = isComposeProjectExpanded(p.name)
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

              <div className="session-docker-group">
                <button type="button" className="session-docker-group-row" onClick={onToggleContainers}>
                  <span className="session-docker-chevron" aria-hidden>
                    {containersExpanded ? '▼' : '▶'}
                  </span>
                  <span className="session-docker-group-icon" aria-hidden>
                    ▣
                  </span>
                  <span className="session-docker-group-name">Containers</span>
                  <span className="session-docker-count">{standaloneCount}</span>
                </button>
                {containersExpanded ? (
                  <div className="session-docker-children">
                    {tree.data.containersError ? (
                      <div className="session-docker-msg session-docker-msg--error">{tree.data.containersError}</div>
                    ) : standaloneCount === 0 ? (
                      <div className="session-docker-msg">无独立容器（compose 内容已归入上方）</div>
                    ) : (
                      tree.data.containers.map((c) => {
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
