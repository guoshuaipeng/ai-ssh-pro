import type {
  DockerComposeProject,
  DockerContainer,
  DockerSwarmPort,
  DockerSwarmService,
  DockerSwarmStack,
  DockerTreeResult
} from './ipc'

/** Same tones as the session-tree Docker branch. */
export type DockerStatusTone = 'running' | 'healthy' | 'unhealthy' | 'starting' | 'exited' | 'other'

export function dockerStatusTone(shortStatus?: string, status?: string): DockerStatusTone {
  const s = `${shortStatus || ''} ${status || ''}`.toLowerCase()
  if (/\bunhealthy\b/.test(s)) return 'unhealthy'
  if (/\bhealthy\b/.test(s)) return 'healthy'
  if (/\bstarting\b|\brestarting\b|\bcreated\b|\bhealth:\s*starting\b/.test(s)) return 'starting'
  if (/\brunning\b/.test(s)) return 'running'
  if (/\bexited\b|\bstopped\b|\bdead\b|\bpaused\b/.test(s)) return 'exited'
  return 'other'
}

export type ToolboxDockerAction =
  | 'open'
  | 'start'
  | 'stop'
  | 'restart'
  | 'rm'
  | 'compose-up'
  | 'compose-down'
  | 'swarm-update'

export type ToolboxDockerGroupId = 'compose' | 'swarm' | 'standalone'

export type ToolboxDockerRow = {
  key: string
  kind: 'compose' | 'swarm' | 'container' | 'stack'
  group: ToolboxDockerGroupId
  /** IPC id: container id, compose project name, or swarm service name. */
  id: string
  /** Label shown in the row. */
  name: string
  /** Name passed to confirm copy and the detail tab. */
  fullName: string
  depth: number
  ancestors: string[]
  tone: DockerStatusTone
  statusText: string
  portsLabel: string
  countLabel: string | null
  image: string
  swarmTask: boolean
  swarmService?: string
  hasChildren: boolean
  actions: ToolboxDockerAction[]
}

export type ToolboxDockerGroup = {
  id: ToolboxDockerGroupId
  count: number
  error?: string
  rows: ToolboxDockerRow[]
}

export type ToolboxDockerModel = {
  missing: boolean
  empty: boolean
  failed: boolean
  failure: string
  noMatch: boolean
  groups: ToolboxDockerGroup[]
}

/** `docker ps` Ports column: `0.0.0.0:8080->80/tcp, :::8080->80/tcp`. */
export function containerPortBadge(ports: string): string {
  const seen: string[] = []
  for (const match of ports.matchAll(/:(\d+)->/g)) {
    const port = match[1]
    if (!port || seen.includes(port)) continue
    seen.push(port)
  }
  if (!seen.length) return ''
  return seen.length > 1 ? `:${seen[0]}+${seen.length - 1}` : `:${seen[0]}`
}

export function swarmPortBadge(ports: DockerSwarmPort[]): string {
  const seen: number[] = []
  for (const port of ports) {
    if (port.publishedPort == null || seen.includes(port.publishedPort)) continue
    seen.push(port.publishedPort)
  }
  if (!seen.length) return ''
  return seen.length > 1 ? `:${seen[0]}+${seen.length - 1}` : `:${seen[0]}`
}

const MISSING_DOCKER =
  /command not found|no such file or directory|cannot connect to the docker daemon|is the docker daemon running|executable file not found/i

function hasMaterial(tree: DockerTreeResult): boolean {
  if (tree.containers.length > 0) return true
  if (tree.composeProjects.length > 0) return true
  return tree.swarm.stacks.some((stack) => stack.services.length > 0)
}

/** Installed daemon that simply has nothing to show, including an inactive Swarm. */
export function dockerToolboxEmpty(tree: DockerTreeResult): boolean {
  if (dockerDaemonMissing(tree)) return false
  if (tree.containersError && !hasMaterial(tree) && !tree.swarm.active) return false
  return !hasMaterial(tree) && !tree.swarm.active
}

/**
 * No docker binary, or the daemon socket is down.
 * A permission error, or a compose-plugin miss while `docker ps` worked, is not "missing".
 */
export function dockerDaemonMissing(tree: DockerTreeResult): boolean {
  if (hasMaterial(tree) || tree.swarm.active) return false
  const err = tree.containersError || ''
  if (!err || /permission denied/i.test(err)) return false
  return MISSING_DOCKER.test(err)
}

function containerRunning(container: DockerContainer): boolean {
  const tone = dockerStatusTone(container.shortStatus, container.status)
  return tone === 'running' || tone === 'healthy' || tone === 'unhealthy' || tone === 'starting'
}

/** Row actions. Swarm tasks cannot be started, stopped, or removed directly. */
export function dockerRowActions(container: DockerContainer): ToolboxDockerAction[] {
  if (container.swarmService) return ['open', 'restart']
  return containerRunning(container) ? ['open', 'stop', 'restart', 'rm'] : ['open', 'start', 'restart', 'rm']
}

/**
 * Confirm before rm, compose up/down, Swarm force-update, and restart of a Swarm task.
 * Plain container start/stop/restart match DockerPanel and run immediately.
 */
export function dockerActionNeedsConfirm(action: ToolboxDockerAction, row?: { swarmTask?: boolean }): boolean {
  if (action === 'rm' || action === 'compose-up' || action === 'compose-down' || action === 'swarm-update') return true
  if (action === 'restart' && row?.swarmTask) return true
  return false
}

/** IPC (or detail opener) each row action calls. Refresh is listTree, not a row action. */
export function toolboxDockerIpc(
  action: ToolboxDockerAction
): 'openDockerDetail' | 'containerAction' | 'composeAction' | 'swarmAction' {
  if (action === 'open') return 'openDockerDetail'
  if (action === 'compose-up' || action === 'compose-down') return 'composeAction'
  if (action === 'swarm-update') return 'swarmAction'
  return 'containerAction'
}

function queryOf(query: string): string {
  return query.trim().toLowerCase()
}

function hit(query: string, ...parts: Array<string | undefined>): boolean {
  if (!query) return true
  return parts.some((part) => part?.toLowerCase().includes(query))
}

function displayContainerName(container: DockerContainer): string {
  if (container.composeService) return container.composeService
  const svc = container.swarmService
  if (svc && container.name.startsWith(`${svc}.`)) return container.name.slice(svc.length + 1)
  return container.name
}

function containerRow(
  container: DockerContainer,
  group: ToolboxDockerGroupId,
  depth: number,
  ancestors: string[]
): ToolboxDockerRow {
  return {
    key: `container:${container.id}`,
    kind: 'container',
    group,
    id: container.id,
    name: displayContainerName(container),
    fullName: container.name,
    depth,
    ancestors,
    tone: dockerStatusTone(container.shortStatus, container.status),
    statusText: container.status || container.shortStatus,
    portsLabel: containerPortBadge(container.ports),
    countLabel: null,
    image: container.image,
    swarmTask: Boolean(container.swarmService),
    swarmService: container.swarmService,
    hasChildren: false,
    actions: dockerRowActions(container)
  }
}

function filterProjects(projects: DockerComposeProject[], query: string): DockerComposeProject[] {
  if (!query) return projects
  const out: DockerComposeProject[] = []
  for (const project of projects) {
    if (hit(query, project.name, project.status, project.configFiles)) {
      out.push(project)
      continue
    }
    const containers = project.containers.filter((container) =>
      hit(query, container.name, container.image, container.composeService, container.status)
    )
    if (containers.length) out.push({ ...project, containers })
  }
  return out
}

function filterStacks(stacks: DockerSwarmStack[], query: string): DockerSwarmStack[] {
  if (!query) return stacks
  const out: DockerSwarmStack[] = []
  for (const stack of stacks) {
    if (stack.name && hit(query, stack.name)) {
      out.push(stack)
      continue
    }
    const services = stack.services
      .map((service) => filterService(service, query))
      .filter((service): service is DockerSwarmService => Boolean(service))
    if (services.length) out.push({ ...stack, services })
  }
  return out
}

function filterService(service: DockerSwarmService, query: string): DockerSwarmService | null {
  if (hit(query, service.name, service.image, service.shortStatus, service.replicas)) return service
  const containers = service.containers.filter((container) => hit(query, container.name, container.image, container.status))
  return containers.length ? { ...service, containers } : null
}

function composeRows(projects: DockerComposeProject[]): ToolboxDockerRow[] {
  const rows: ToolboxDockerRow[] = []
  for (const project of projects) {
    const key = `compose:${project.name}`
    rows.push({
      key,
      kind: 'compose',
      group: 'compose',
      id: project.name,
      name: project.name,
      fullName: project.name,
      depth: 0,
      ancestors: [],
      tone: dockerStatusTone(undefined, project.status),
      statusText: project.status || project.name,
      portsLabel: '',
      countLabel: String(project.containers.length),
      image: '',
      swarmTask: false,
      hasChildren: project.containers.length > 0,
      actions: ['open', 'compose-up', 'compose-down']
    })
    for (const container of project.containers) {
      rows.push(containerRow(container, 'compose', 1, [key]))
    }
  }
  return rows
}

function swarmRows(stacks: DockerSwarmStack[]): ToolboxDockerRow[] {
  const rows: ToolboxDockerRow[] = []
  for (const stack of stacks) {
    const named = Boolean(stack.name)
    const stackKey = named ? `stack:${stack.name}` : ''
    const serviceAncestors = named ? [stackKey] : []
    if (named) {
      rows.push({
        key: stackKey,
        kind: 'stack',
        group: 'swarm',
        id: stack.name,
        name: stack.name,
        fullName: stack.name,
        depth: 0,
        ancestors: [],
        tone: 'other',
        statusText: stack.name,
        portsLabel: '',
        countLabel: String(stack.services.length),
        image: '',
        swarmTask: false,
        hasChildren: stack.services.length > 0,
        actions: []
      })
    }
    for (const service of stack.services) {
      const key = `swarm:${service.name}`
      const depth = named ? 1 : 0
      rows.push({
        key,
        kind: 'swarm',
        group: 'swarm',
        id: service.name,
        name: service.name,
        fullName: service.name,
        depth,
        ancestors: serviceAncestors,
        tone: dockerStatusTone(service.shortStatus),
        statusText: service.replicas || service.shortStatus,
        portsLabel: swarmPortBadge(service.ports),
        countLabel: service.replicas,
        image: service.image,
        swarmTask: false,
        hasChildren: service.containers.length > 0,
        actions: ['open', 'swarm-update']
      })
      for (const container of service.containers) {
        rows.push(containerRow(container, 'swarm', depth + 1, [...serviceAncestors, key]))
      }
    }
  }
  return rows
}

function groupCount(id: ToolboxDockerGroupId, rows: ToolboxDockerRow[]): number {
  if (id === 'compose') return rows.filter((row) => row.kind === 'compose').length
  if (id === 'swarm') return rows.filter((row) => row.kind === 'swarm').length
  return rows.filter((row) => row.kind === 'container').length
}

/** Compose / swarm / standalone rows for the toolbox table. */
export function toolboxDockerList(tree: DockerTreeResult, query = ''): ToolboxDockerModel {
  const q = queryOf(query)
  const missing = dockerDaemonMissing(tree)
  const failure = tree.containersError || ''
  const failed = !missing && !hasMaterial(tree) && !tree.swarm.active && Boolean(failure)
  const empty = !missing && !failed && dockerToolboxEmpty(tree)
  const projects = filterProjects(tree.composeProjects, q)
  const stacks = filterStacks(tree.swarm.stacks, q)
  const standalone = q
    ? tree.containers.filter((container) => hit(q, container.name, container.image, container.status, container.ports))
    : tree.containers
  const compose: ToolboxDockerGroup = {
    id: 'compose',
    rows: composeRows(projects),
    error: tree.composeError,
    count: 0
  }
  compose.count = groupCount('compose', compose.rows)
  const groups: ToolboxDockerGroup[] = [compose]
  if (tree.swarm.active) {
    const swarm: ToolboxDockerGroup = {
      id: 'swarm',
      rows: swarmRows(stacks),
      error: tree.swarm.error,
      count: 0
    }
    swarm.count = groupCount('swarm', swarm.rows)
    groups.push(swarm)
  }
  const aloneRows = standalone.map((container) => containerRow(container, 'standalone', 0, []))
  groups.push({
    id: 'standalone',
    rows: aloneRows,
    error: tree.containersError,
    count: groupCount('standalone', aloneRows)
  })
  const noMatch = !missing && !failed && !empty && q.length > 0 && groups.every((group) => group.rows.length === 0)
  return { missing, empty, failed, failure, noMatch, groups }
}
