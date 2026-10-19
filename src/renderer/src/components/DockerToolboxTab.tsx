import { useCallback, useEffect, useState } from 'react'
import type { DockerTreeResult } from '@shared/ipc'
import {
  dockerActionNeedsConfirm,
  toolboxDockerIpc,
  toolboxDockerList,
  type ToolboxDockerAction,
  type ToolboxDockerGroup,
  type ToolboxDockerRow
} from '@shared/docker-toolbox'
import { useI18n } from '../lib/i18n'
import { confirmDialog } from '../lib/dialogs'
import EmptyState from './EmptyState'
import { QUIET_LOAD_ATTRS } from '@shared/quiet-load'
import Icon, { Twist } from './Icon'
import { CHROME_ICON_STROKE, TREE_CHEVRON_SIZE } from './emptyIcons'

type TFn = ReturnType<typeof useI18n>['t']

export type DockerToolboxOpen = {
  kind: 'container' | 'compose' | 'swarm'
  resourceId: string
  resourceName: string
}

type Props = {
  sessionId: string
  busy: boolean
  writesDisabled?: boolean
  guard: <T>(fn: () => Promise<T>) => Promise<T | undefined>
  setNotice: (s: string | null) => void
  t: TFn
  onOpenDocker?: (target: DockerToolboxOpen) => void
  onDockerChanged?: () => void
}

const GROUP_LABEL = {
  compose: 'st.docker.compose',
  swarm: 'st.docker.swarm',
  standalone: 'st.docker.containers'
} as const

async function confirmDockerAction(action: ToolboxDockerAction, row: ToolboxDockerRow, t: TFn): Promise<boolean> {
  if (action === 'rm') {
    return confirmDialog({
      title: t('dlg.confirmTitle'),
      body: t('ui.72', { 0: row.fullName }),
      danger: true,
      confirmText: t('dlg.delete')
    })
  }
  if (action === 'restart' && row.swarmTask) {
    return confirmDialog({
      title: t('dlg.confirmTitle'),
      body: t('ui.73', { 0: row.fullName, 1: row.swarmService || row.fullName }) + t('ui.74'),
      confirmText: t('dlg.restart')
    })
  }
  if (action === 'swarm-update') {
    return confirmDialog({
      title: t('dlg.confirmTitle'),
      body: t('ui.79', { 0: row.fullName }),
      confirmText: t('dlg.restart')
    })
  }
  if (action === 'compose-up' || action === 'compose-down') {
    const label = action === 'compose-up' ? 'up -d' : 'down'
    return confirmDialog({
      title: t('dlg.confirmTitle'),
      body: t('ui.84', { 0: row.fullName, 1: label }),
      danger: action === 'compose-down',
      confirmText: label
    })
  }
  return true
}

/** Server toolbox Docker tab: same tree as the session branch, with row actions. */
export default function DockerToolboxTab({
  sessionId,
  busy,
  writesDisabled = false,
  guard,
  setNotice,
  t,
  onOpenDocker,
  onDockerChanged
}: Props) {
  const [tree, setTree] = useState<DockerTreeResult | null>(null)
  const [query, setQuery] = useState('')
  const [closed, setClosed] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    const next = await guard(() => window.aiss.docker.listTree(sessionId))
    if (next) setTree(next)
  }, [guard, sessionId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return window.aiss.docker.onChanged((ev) => {
      if (ev.sessionId === sessionId) void load()
    })
  }, [load, sessionId])

  const toggle = (key: string) => setClosed((prev) => ({ ...prev, [key]: !prev[key] }))

  const run = async (row: ToolboxDockerRow, action: ToolboxDockerAction) => {
    if (writesDisabled && action !== 'open') return
    if (dockerActionNeedsConfirm(action, row)) {
      const ok = await confirmDockerAction(action, row, t)
      if (!ok) return
    }
    if (action === 'open') {
      if (row.kind !== 'container' && row.kind !== 'compose' && row.kind !== 'swarm') return
      onOpenDocker?.({ kind: row.kind, resourceId: row.id, resourceName: row.fullName })
      return
    }
    const ipc = toolboxDockerIpc(action)
    let done = false
    if (ipc === 'composeAction') {
      const result = await guard(() =>
        window.aiss.docker.composeAction(sessionId, row.id, action === 'compose-up' ? 'up' : 'down')
      )
      if (result) {
        setNotice(t('ui.85', { 0: action === 'compose-up' ? 'up -d' : 'down' }))
        done = true
      }
    } else if (ipc === 'swarmAction') {
      const result = await guard(() => window.aiss.docker.swarmAction(sessionId, row.id, 'restart'))
      if (result) {
        setNotice(t('ui.80'))
        done = true
      }
    } else if (ipc === 'containerAction') {
      const result = await guard(() =>
        window.aiss.docker.containerAction(sessionId, row.id, action as 'start' | 'stop' | 'restart' | 'rm')
      )
      if (result) {
        setNotice(
          action === 'rm'
            ? t('ui.76')
            : row.swarmTask && row.swarmService
              ? t('ui.77', { 0: row.swarmService })
              : t('ui.78', { 0: action })
        )
        done = true
      }
    }
    if (!done) return
    onDockerChanged?.()
    void load()
  }

  if (!tree) {
    return busy ? <p className="quiet-load" {...QUIET_LOAD_ATTRS}>{t('rm.loading')}</p> : null
  }

  const model = toolboxDockerList(tree, query)
  const refresh = (
    <button type="button" onClick={() => void load()} disabled={busy} data-testid="toolbox-docker-refresh">
      {t('rm.refresh')}
    </button>
  )

  if (model.missing) {
    return (
      <EmptyState
        icon="docker"
        title={t('docker.missing')}
        testId="toolbox-docker-missing"
        primary={{ label: t('rm.refresh'), onClick: () => void load(), testId: 'toolbox-docker-refresh' }}
      />
    )
  }

  if (model.failed) {
    return (
      <div className="st-body" data-testid="toolbox-docker-failed">
        <div className="st-row st-row--docker">{refresh}</div>
        <p className="st-error">{t('docker.readFail', { reason: model.failure })}</p>
      </div>
    )
  }

  if (model.empty) {
    return (
      <EmptyState
        icon="docker"
        title={t('st.docker.empty')}
        testId="toolbox-docker-empty"
        primary={{ label: t('rm.refresh'), onClick: () => void load(), testId: 'toolbox-docker-refresh' }}
      />
    )
  }

  const shown = model.groups.reduce((n, group) => n + group.count, 0)
  const total = toolboxDockerList(tree).groups.reduce((n, group) => n + group.count, 0)

  return (
    <div className="st-body" data-testid="toolbox-docker-tab">
      <div className="st-row st-row--docker">
        <input
          className="st-search"
          placeholder={t('st.docker.search')}
          aria-label={t('st.docker.search')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {refresh}
        <span className="st-count">{t('st.count', { shown, total })}</span>
      </div>
      {model.noMatch ? (
        <EmptyState compact icon="docker" title={t('st.docker.noMatch')} testId="toolbox-docker-nomatch" />
      ) : (
        <div className="st-table-wrap">
          <table className="st-table st-docker" data-testid="toolbox-docker">
            <colgroup>
              <col />
              <col className="st-docker-ports" />
              <col className="st-docker-count" />
              <col className="st-docker-actions" />
            </colgroup>
            <thead>
              <tr>
                <th>{t('st.docker.name')}</th>
                <th>{t('st.docker.ports')}</th>
                <th>{t('st.docker.count')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {model.groups.map((group) => (
                <GroupRows
                  key={group.id}
                  group={group}
                  closed={closed}
                  busy={busy}
                  writesDisabled={writesDisabled}
                  t={t}
                  onToggle={toggle}
                  onRun={(row, action) => void run(row, action)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function GroupRows({
  group,
  closed,
  busy,
  writesDisabled,
  t,
  onToggle,
  onRun
}: {
  group: ToolboxDockerGroup
  closed: Record<string, boolean>
  busy: boolean
  writesDisabled: boolean
  t: TFn
  onToggle: (key: string) => void
  onRun: (row: ToolboxDockerRow, action: ToolboxDockerAction) => void
}) {
  const groupKey = `group:${group.id}`
  const open = !closed[groupKey]
  const emptyLabel =
    group.id === 'compose' ? t('db.noProjects') : group.id === 'swarm' ? t('db.noServices') : t('db.noStandalone')
  const visible = group.rows.filter((row) => row.ancestors.every((key) => !closed[key]))
  return (
    <>
      <tr className="st-docker-group">
        <td colSpan={4}>
          <button type="button" className="st-docker-toggle" aria-expanded={open} onClick={() => onToggle(groupKey)}>
            <Twist open={open} size={TREE_CHEVRON_SIZE} />
            <span className="st-docker-label">{t(GROUP_LABEL[group.id])}</span>
            <span className="session-docker-count">{group.count}</span>
          </button>
        </td>
      </tr>
      {open && group.error ? (
        <tr>
          <td colSpan={4} className="st-error">
            {group.error}
          </td>
        </tr>
      ) : null}
      {open && !group.error && group.rows.length === 0 ? (
        <tr>
          <td colSpan={4} className="st-docker-group-empty">
            <span className="st-docker-group-empty-line">
              <Icon name="list-tree" size={16} strokeWidth={CHROME_ICON_STROKE} />
              {emptyLabel}
            </span>
          </td>
        </tr>
      ) : null}
      {open
        ? visible.map((row) => (
            <DockerRow
              key={row.key}
              row={row}
              closed={closed}
              busy={busy}
              writesDisabled={writesDisabled}
              t={t}
              onToggle={onToggle}
              onRun={onRun}
            />
          ))
        : null}
    </>
  )
}

function DockerRow({
  row,
  closed,
  busy,
  writesDisabled,
  t,
  onToggle,
  onRun
}: {
  row: ToolboxDockerRow
  closed: Record<string, boolean>
  busy: boolean
  writesDisabled: boolean
  t: TFn
  onToggle: (key: string) => void
  onRun: (row: ToolboxDockerRow, action: ToolboxDockerAction) => void
}) {
  const locked = writesDisabled ? t('s4.sftpDisabled') : undefined
  const canOpen = row.actions.includes('open')
  return (
    <tr data-testid="toolbox-docker-row" data-kind={row.kind} data-id={row.id}>
      <td className={row.depth ? `st-docker-indent-${Math.min(row.depth, 2)}` : undefined}>
        <div className="st-docker-name">
          {row.hasChildren ? (
            <button
              type="button"
              className="session-docker-chevron-btn"
              aria-expanded={!closed[row.key]}
              onClick={() => onToggle(row.key)}
            >
              <Twist open={!closed[row.key]} size={TREE_CHEVRON_SIZE} />
            </button>
          ) : (
            <span className="session-docker-chevron" aria-hidden />
          )}
          {canOpen ? (
            <button
              type="button"
              className="st-docker-namebtn"
              title={row.image ? `${row.fullName}\n${row.image}\n${row.statusText}` : row.statusText}
              onClick={() => onRun(row, 'open')}
            >
              <span className={`docker-status-icon docker-status-icon--${row.tone}`} title={row.statusText} role="img" aria-label={row.statusText} />
              <span className="st-docker-label">{row.name}</span>
            </button>
          ) : (
            <span className="st-docker-namebtn">
              <span className="session-docker-group-icon" aria-hidden>
                <Icon name="table" size={12} />
              </span>
              <span className="st-docker-label">{row.name}</span>
            </span>
          )}
        </div>
      </td>
      <td>{row.portsLabel ? <span className="session-docker-port-badge">{row.portsLabel}</span> : null}</td>
      <td className="num">{row.countLabel ? <span className="session-docker-count">{row.countLabel}</span> : null}</td>
      <td className="st-actions st-actions--hover">
        {canOpen ? (
          <button type="button" className="st-icon-btn" data-action="open" title={t('st.docker.open')} aria-label={t('st.docker.open')} disabled={busy} onClick={() => onRun(row, 'open')}>
            <Icon name="file-text" size={12} />
          </button>
        ) : null}
        {row.actions.includes('start') ? (
          <ActionIcon name="play" action="start" label={t('ui.101')} busy={busy} locked={locked} onRun={() => onRun(row, 'start')} />
        ) : null}
        {row.actions.includes('stop') ? (
          <ActionIcon name="square" action="stop" label={t('ui.103')} busy={busy} locked={locked} onRun={() => onRun(row, 'stop')} />
        ) : null}
        {row.actions.includes('restart') ? (
          <ActionIcon name="refresh-cw" action="restart" label={t('ui.104')} busy={busy} locked={locked} onRun={() => onRun(row, 'restart')} />
        ) : null}
        {row.actions.includes('compose-up') ? (
          <ActionIcon name="arrow-up" action="compose-up" label={t('st.docker.up')} busy={busy} locked={locked} onRun={() => onRun(row, 'compose-up')} />
        ) : null}
        {row.actions.includes('compose-down') ? (
          <ActionIcon name="arrow-down" action="compose-down" label={t('st.docker.down')} busy={busy} locked={locked} danger onRun={() => onRun(row, 'compose-down')} />
        ) : null}
        {row.actions.includes('swarm-update') ? (
          <ActionIcon name="refresh-cw" action="swarm-update" label={t('st.docker.update')} busy={busy} locked={locked} onRun={() => onRun(row, 'swarm-update')} />
        ) : null}
        {row.actions.includes('rm') ? (
          <details className="st-more">
            <summary className="st-icon-btn" aria-label="…">
              ⋯
            </summary>
            <div className="st-more-menu">
              <button type="button" className="danger" data-action="rm" disabled={busy || writesDisabled} title={locked} onClick={() => onRun(row, 'rm')}>
                {t('ui.8')}
              </button>
            </div>
          </details>
        ) : null}
      </td>
    </tr>
  )
}

function ActionIcon({
  name,
  action,
  label,
  busy,
  locked,
  danger,
  onRun
}: {
  name: 'play' | 'square' | 'refresh-cw' | 'arrow-up' | 'arrow-down'
  action: ToolboxDockerAction
  label: string
  busy: boolean
  locked?: string
  danger?: boolean
  onRun: () => void
}) {
  return (
    <button
      type="button"
      className={danger ? 'st-icon-btn danger' : 'st-icon-btn'}
      data-action={action}
      title={locked || label}
      aria-label={label}
      disabled={busy || Boolean(locked)}
      onClick={onRun}
    >
      <Icon name={name} size={12} />
    </button>
  )
}
