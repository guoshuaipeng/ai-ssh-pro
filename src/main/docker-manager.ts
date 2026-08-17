import type { Client } from 'ssh2'
import type {
  DockerComposeProject,
  DockerComposeService,
  DockerContainer,
  DockerContainerAction,
  DockerComposeAction,
  DockerTreeResult
} from '../shared/ipc'

export type ExecResult = {
  code: number
  stdout: string
  stderr: string
}

export function sshExec(client: Client, command: string): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    client.exec(command, (err, stream) => {
      if (err) {
        reject(err)
        return
      }
      let stdout = ''
      let stderr = ''
      stream.on('data', (d: Buffer) => {
        stdout += d.toString('utf8')
      })
      stream.stderr.on('data', (d: Buffer) => {
        stderr += d.toString('utf8')
      })
      stream.on('close', (code: number | null) => {
        resolve({ code: code ?? 0, stdout, stderr })
      })
    })
  })
}

/** 仅允许 docker 容器 id / 名称中的安全字符 */
export function assertSafeDockerId(id: string, label = 'id'): string {
  const s = String(id || '').trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(s)) {
    throw new Error(`非法 Docker ${label}`)
  }
  return s
}

function assertSafeComposeProject(name: string): string {
  return assertSafeDockerId(name, 'compose 项目名')
}

function trimErr(stdout: string, stderr: string, code: number): string {
  const msg = (stderr || stdout || `exit ${code}`).trim()
  return msg.slice(0, 800)
}

function parseJsonLines(text: string): unknown[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  const out: unknown[] = []
  for (const line of lines) {
    try {
      out.push(JSON.parse(line))
    } catch {
      /* skip bad line */
    }
  }
  return out
}

function parseJsonArrayOrLines(text: string): unknown[] {
  const t = text.trim()
  if (!t) return []
  try {
    const parsed = JSON.parse(t) as unknown
    if (Array.isArray(parsed)) return parsed
    if (parsed && typeof parsed === 'object') return [parsed]
  } catch {
    /* fall through to ndjson */
  }
  return parseJsonLines(t)
}

function shortStatus(state: string, status: string): string {
  const st = status.toLowerCase()
  const stt = state.toLowerCase()
  if (/\(health:\s*starting\)|\bhealth:\s*starting\b/.test(st)) return 'starting'
  if (/\bunhealthy\b/.test(st)) return 'unhealthy'
  if (/\bhealthy\b/.test(st)) return 'healthy'
  if (stt === 'restarting' || /\brestarting\b/.test(st)) return 'starting'
  if (stt === 'created' || stt === 'starting') return 'starting'
  if (stt === 'running') return 'running'
  if (stt === 'exited') return 'exited'
  if (stt === 'paused') return 'paused'
  if (state) return state
  return status.slice(0, 32) || 'unknown'
}

function parseLabelMap(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw) return out
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v
    }
    return out
  }
  if (typeof raw !== 'string' || !raw.trim()) return out
  // docker ps --format json: "k=v,k2=v2" (values may contain =)
  for (const part of raw.split(',')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    const k = part.slice(0, i).trim()
    const v = part.slice(i + 1).trim()
    if (k) out[k] = v
  }
  return out
}

function mapContainer(raw: Record<string, unknown>): DockerContainer | null {
  const id = typeof raw.ID === 'string' ? raw.ID : typeof raw.Id === 'string' ? raw.Id : ''
  if (!id) return null
  const namesRaw = typeof raw.Names === 'string' ? raw.Names : typeof raw.Name === 'string' ? raw.Name : ''
  const name = namesRaw.replace(/^\//, '').split(',')[0]?.trim() || id.slice(0, 12)
  const image = typeof raw.Image === 'string' ? raw.Image : ''
  const state = typeof raw.State === 'string' ? raw.State : ''
  const status = typeof raw.Status === 'string' ? raw.Status : state
  const ports = typeof raw.Ports === 'string' ? raw.Ports : ''
  const createdAt = typeof raw.CreatedAt === 'string' ? raw.CreatedAt : undefined
  const labels = parseLabelMap(raw.Labels)
  const composeProject = labels['com.docker.compose.project']?.trim() || undefined
  const composeService = labels['com.docker.compose.service']?.trim() || undefined
  const swarmService = labels['com.docker.swarm.service.name']?.trim() || undefined
  return {
    id,
    name,
    image,
    state,
    status,
    shortStatus: shortStatus(state, status),
    ports,
    createdAt,
    ...(composeProject ? { composeProject } : {}),
    ...(composeService ? { composeService } : {}),
    ...(swarmService ? { swarmService } : {})
  }
}

export async function listContainers(client: Client): Promise<{ containers: DockerContainer[]; error?: string }> {
  const r = await sshExec(client, `docker ps -a --format '{{json .}}'`)
  if (r.code !== 0) {
    return { containers: [], error: trimErr(r.stdout, r.stderr, r.code) }
  }
  const containers = parseJsonLines(r.stdout)
    .map((x) => (x && typeof x === 'object' ? mapContainer(x as Record<string, unknown>) : null))
    .filter(Boolean) as DockerContainer[]
  return { containers }
}

export async function listComposeProjects(
  client: Client
): Promise<{ projects: DockerComposeProject[]; error?: string }> {
  const r = await sshExec(client, 'docker compose ls --format json')
  if (r.code !== 0) {
    const fallback = await sshExec(client, 'docker-compose ls --format json')
    if (fallback.code !== 0) {
      return { projects: [], error: trimErr(r.stdout, r.stderr, r.code) }
    }
    return { projects: mapComposeProjects(fallback.stdout) }
  }
  return { projects: mapComposeProjects(r.stdout) }
}

function mapComposeProjects(stdout: string): DockerComposeProject[] {
  return parseJsonArrayOrLines(stdout)
    .map((x) => {
      if (!x || typeof x !== 'object') return null
      const o = x as Record<string, unknown>
      const name = typeof o.Name === 'string' ? o.Name.trim() : ''
      if (!name) return null
      const status = typeof o.Status === 'string' ? o.Status : undefined
      const configFiles = typeof o.ConfigFiles === 'string' ? o.ConfigFiles : undefined
      return { name, status, configFiles, containers: [] } satisfies DockerComposeProject
    })
    .filter(Boolean) as DockerComposeProject[]
}

export async function listTree(client: Client): Promise<DockerTreeResult> {
  const [c, p] = await Promise.all([listContainers(client), listComposeProjects(client)])
  const byProject = new Map<string, DockerContainer[]>()
  const standalone: DockerContainer[] = []

  for (const container of c.containers) {
    const proj = container.composeProject?.trim()
    if (proj) {
      const list = byProject.get(proj) ?? []
      list.push(container)
      byProject.set(proj, list)
    } else {
      standalone.push(container)
    }
  }

  const projects = [...p.projects]
  const known = new Set(projects.map((x) => x.name))
  for (const name of byProject.keys()) {
    if (!known.has(name)) {
      projects.push({ name, containers: [] })
      known.add(name)
    }
  }

  for (const project of projects) {
    project.containers = byProject.get(project.name) ?? []
  }

  projects.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
  standalone.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))

  return {
    containers: standalone,
    composeProjects: projects,
    containersError: c.error,
    composeError: p.error
  }
}

export async function containerAction(
  client: Client,
  containerId: string,
  action: DockerContainerAction
): Promise<void> {
  const id = assertSafeDockerId(containerId, '容器')

  // Swarm 任务：docker restart/start/stop 会打乱编排，常导致多实例残留
  const inspect = await sshExec(
    client,
    `docker inspect --format '{{index .Config.Labels "com.docker.swarm.service.name"}}' ${id}`
  )
  const swarmService = (inspect.stdout || '').trim()
  if (swarmService && /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(swarmService)) {
    if (action === 'restart') {
      const r = await sshExec(client, `docker service update --force ${swarmService}`)
      if (r.code !== 0) throw new Error(trimErr(r.stdout, r.stderr, r.code))
      return
    }
    if (action === 'start' || action === 'stop' || action === 'rm') {
      throw new Error(
        `「${id}」属于 Swarm 服务「${swarmService}」。请勿直接 ${action} 任务容器（会导致多实例）。` +
          `重启请用「重启」按钮（service update --force）；停服可用：docker service scale ${swarmService}=0`
      )
    }
  }

  const cmd =
    action === 'start'
      ? `docker start ${id}`
      : action === 'stop'
        ? `docker stop ${id}`
        : action === 'restart'
          ? `docker restart ${id}`
          : action === 'rm'
            ? `docker rm -f ${id}`
            : null
  if (!cmd) throw new Error(`不支持的容器操作: ${action}`)
  const r = await sshExec(client, cmd)
  if (r.code !== 0) throw new Error(trimErr(r.stdout, r.stderr, r.code))
}

export async function containerLogs(
  client: Client,
  containerId: string,
  tail = 200
): Promise<string> {
  const id = assertSafeDockerId(containerId, '容器')
  const n = Math.min(2000, Math.max(20, Math.floor(tail) || 200))
  const r = await sshExec(client, `docker logs --tail ${n} ${id} 2>&1`)
  if (r.code !== 0 && !r.stdout.trim()) {
    throw new Error(trimErr(r.stdout, r.stderr, r.code))
  }
  return (r.stdout || r.stderr || '').slice(-200_000)
}

export async function composePs(
  client: Client,
  project: string
): Promise<{ services: DockerComposeService[]; error?: string }> {
  const name = assertSafeComposeProject(project)
  const r = await sshExec(client, `docker compose -p ${name} ps -a --format '{{json .}}'`)
  if (r.code !== 0) {
    return { services: [], error: trimErr(r.stdout, r.stderr, r.code) }
  }
  const services = parseJsonLines(r.stdout)
    .map((x) => {
      if (!x || typeof x !== 'object') return null
      const o = x as Record<string, unknown>
      const svc =
        typeof o.Service === 'string'
          ? o.Service
          : typeof o.Name === 'string'
            ? o.Name
            : typeof o.Names === 'string'
              ? o.Names.replace(/^\//, '').split(',')[0] || ''
              : ''
      const id = typeof o.ID === 'string' ? o.ID : typeof o.Id === 'string' ? o.Id : undefined
      const state = typeof o.State === 'string' ? o.State : typeof o.Status === 'string' ? o.Status : ''
      const status = typeof o.Status === 'string' ? o.Status : state
      if (!svc && !id) return null
      return {
        name: svc || id || '?',
        id,
        state,
        status,
        shortStatus: shortStatus(state, status)
      } satisfies DockerComposeService
    })
    .filter(Boolean) as DockerComposeService[]
  return { services }
}

export async function composeAction(
  client: Client,
  project: string,
  action: DockerComposeAction
): Promise<void> {
  const name = assertSafeComposeProject(project)
  const cmd =
    action === 'up'
      ? `docker compose -p ${name} up -d`
      : action === 'down'
        ? `docker compose -p ${name} down`
        : null
  if (!cmd) throw new Error(`不支持的 compose 操作: ${action}`)
  const r = await sshExec(client, cmd)
  if (r.code !== 0) throw new Error(trimErr(r.stdout, r.stderr, r.code))
}
