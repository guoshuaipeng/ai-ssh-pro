/** Polish-5: toolbox Docker matches the session tree. Package is 0.4.6. No separate FileVersion. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { rollback, tipSuggest } from '../src/main/core-a-output-truncate'
import {
  containerPortBadge,
  dockerActionNeedsConfirm,
  dockerDaemonMissing,
  dockerRowActions,
  dockerStatusTone,
  dockerToolboxEmpty,
  swarmPortBadge,
  toolboxDockerIpc,
  toolboxDockerList
} from '../src/shared/docker-toolbox'
import type { DockerContainer, DockerTreeResult } from '../src/shared/ipc'
import { translate } from '../src/renderer/src/lib/i18n'

const zh = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('zh-CN', key, vars)
const en = (key: Parameters<typeof translate>[1], vars?: Record<string, string | number>) => translate('en', key, vars)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string }
}
const rawPkg = readFileSync('package.json', 'utf8')
assert.equal(pkg.version, '0.4.13')
assert.equal(pkg.version.split('.').length, 3)
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal(rawPkg.includes('fileVersion'), false)
assert.equal(pkg.scripts.test.includes('scripts/test-polish-5.ts'), true)
assert.equal(tipSuggest, '0.4.13-polish12')
assert.equal(rollback, '0.4.12-polish11')
assert.equal(rawPkg.includes(tipSuggest), false)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.7'))
const note = changelog.slice(changelog.indexOf('## v0.4.6'), changelog.indexOf('## v0.4.5'))
assert.ok(unreleased.includes('Polish-7'))
assert.ok(unreleased.includes('UX-64'))
assert.equal(note.includes('soft-start'), false)
assert.ok(note.includes('Polish-5'))
assert.equal(note.includes('Public HOLD'), false)
assert.equal(note.includes('不打 tag'), false)
assert.equal(note.includes('No tag'), false)
assert.equal(note.includes('Not tagged'), false)
assert.equal(note.includes('No GitHub Release'), false)
assert.equal(note.includes('no public site'), false)
assert.ok(note.includes('fileVersion'))
assert.equal(note.includes('0.4.6.1'), false)
assert.ok(changelogFor('0.4.6').length >= 4)
assert.ok(changelogFor('0.4.6').some((entry) => entry.action === 'serverTools'))

const box = (over: Partial<DockerTreeResult> = {}): DockerTreeResult => ({
  containers: [],
  composeProjects: [],
  swarm: { active: false, manager: false, stacks: [] },
  ...over
})

const redis: DockerContainer = {
  id: 'c1',
  name: 'redis',
  image: 'redis:7',
  state: 'running',
  status: 'Up 2 hours',
  shortStatus: 'running',
  ports: '0.0.0.0:6379->6379/tcp, :::6379->6379/tcp'
}
const api: DockerContainer = {
  id: 'c2',
  name: 'web-api-1',
  image: 'api',
  state: 'running',
  status: 'Up (healthy)',
  shortStatus: 'healthy',
  ports: '0.0.0.0:8080->80/tcp, 0.0.0.0:8443->443/tcp',
  composeProject: 'web',
  composeService: 'api'
}
const db: DockerContainer = {
  id: 'c3',
  name: 'web-db-1',
  image: 'postgres',
  state: 'exited',
  status: 'Exited (0) 1 hour ago',
  shortStatus: 'exited',
  ports: '5432/tcp',
  composeProject: 'web',
  composeService: 'db'
}
const task: DockerContainer = {
  id: 'c4',
  name: 'edge_proxy.1.abc',
  image: 'nginx',
  state: 'running',
  status: 'Up',
  shortStatus: 'running',
  ports: '',
  swarmService: 'edge_proxy'
}

const tree = box({
  containers: [redis],
  composeProjects: [{ name: 'web', status: 'running(2)', containers: [api, db] }],
  swarm: {
    active: true,
    manager: true,
    stacks: [
      {
        name: 'edge',
        services: [
          {
            id: 'svc1',
            name: 'edge_proxy',
            image: 'nginx',
            mode: 'replicated',
            replicas: '1/1',
            runningTasks: 1,
            desiredTasks: 1,
            shortStatus: 'running',
            ports: [
              { targetPort: 80, publishedPort: 80, protocol: 'tcp', publishMode: 'ingress' },
              { targetPort: 443, publishedPort: 443, protocol: 'tcp', publishMode: 'ingress' }
            ],
            stack: 'edge',
            containers: [task]
          }
        ]
      }
    ]
  }
})

assert.equal(dockerStatusTone('healthy', 'Up (healthy)'), 'healthy')
assert.equal(dockerStatusTone('running', 'Up 2 hours'), 'running')
assert.equal(dockerStatusTone('exited', 'Exited (0)'), 'exited')
assert.equal(containerPortBadge(redis.ports), ':6379')
assert.equal(containerPortBadge(api.ports), ':8080+1')
assert.equal(containerPortBadge(db.ports), '')
assert.equal(swarmPortBadge(tree.swarm.stacks[0]!.services[0]!.ports), ':80+1')

const model = toolboxDockerList(tree)
assert.equal(model.missing, false)
assert.equal(model.empty, false)
assert.equal(model.failed, false)
assert.deepEqual(
  model.groups.map((group) => group.id),
  ['compose', 'swarm', 'standalone']
)
assert.equal(model.groups[0]!.count, 1)
assert.equal(model.groups[1]!.count, 1)
assert.equal(model.groups[2]!.count, 1)

const project = model.groups[0]!.rows[0]!
assert.equal(project.kind, 'compose')
assert.equal(project.name, 'web')
assert.equal(project.tone, 'running')
assert.equal(project.countLabel, '2')
assert.deepEqual(project.actions, ['open', 'compose-up', 'compose-down'])
const apiRow = model.groups[0]!.rows[1]!
assert.equal(apiRow.name, 'api')
assert.equal(apiRow.portsLabel, ':8080+1')
assert.equal(apiRow.depth, 1)
assert.deepEqual(apiRow.ancestors, ['compose:web'])
assert.deepEqual(apiRow.actions, ['open', 'stop', 'restart', 'rm'])
const dbRow = model.groups[0]!.rows[2]!
assert.equal(dbRow.tone, 'exited')
assert.ok(dbRow.actions.includes('start'))
assert.equal(dbRow.actions.includes('stop'), false)

const stack = model.groups[1]!.rows[0]!
assert.equal(stack.kind, 'stack')
assert.deepEqual(stack.actions, [])
const service = model.groups[1]!.rows[1]!
assert.equal(service.kind, 'swarm')
assert.equal(service.id, 'edge_proxy')
assert.equal(service.portsLabel, ':80+1')
assert.equal(service.countLabel, '1/1')
assert.deepEqual(service.actions, ['open', 'swarm-update'])
const taskRow = model.groups[1]!.rows[2]!
assert.equal(taskRow.swarmTask, true)
assert.equal(taskRow.name, '1.abc')
assert.deepEqual(taskRow.actions, ['open', 'restart'])
assert.equal(taskRow.actions.includes('rm'), false)
assert.equal(dockerRowActions(task).includes('rm'), false)

const alone = model.groups[2]!.rows[0]!
assert.equal(alone.name, 'redis')
assert.equal(alone.portsLabel, ':6379')
assert.equal(alone.depth, 0)

const filtered = toolboxDockerList(tree, 'redis')
assert.equal(filtered.noMatch, false)
assert.equal(filtered.groups[0]!.rows.length, 0)
assert.equal(filtered.groups[2]!.rows.length, 1)
assert.equal(toolboxDockerList(tree, 'no-such-name').noMatch, true)

const quiet = box()
assert.equal(dockerToolboxEmpty(quiet), true)
assert.equal(dockerDaemonMissing(quiet), false)
assert.equal(toolboxDockerList(quiet).empty, true)
assert.equal(toolboxDockerList(quiet).missing, false)

const missing = box({ containersError: 'bash: docker: command not found' })
assert.equal(dockerDaemonMissing(missing), true)
assert.equal(toolboxDockerList(missing).missing, true)
assert.equal(toolboxDockerList(missing).empty, false)

const down = box({ containersError: 'Cannot connect to the Docker daemon. Is the docker daemon running?' })
assert.equal(dockerDaemonMissing(down), true)

const denied = box({ containersError: 'permission denied while trying to connect to the Docker daemon socket' })
assert.equal(dockerDaemonMissing(denied), false)
assert.equal(toolboxDockerList(denied).failed, true)
assert.equal(toolboxDockerList(denied).failure.includes('permission denied'), true)

const composeOnly = box({ composeError: "docker: 'compose' is not a docker command" })
assert.equal(dockerDaemonMissing(composeOnly), false)
assert.equal(toolboxDockerList(composeOnly).empty, true)

assert.equal(dockerActionNeedsConfirm('rm'), true)
assert.equal(dockerActionNeedsConfirm('compose-down'), true)
assert.equal(dockerActionNeedsConfirm('compose-up'), true)
assert.equal(dockerActionNeedsConfirm('swarm-update'), true)
assert.equal(dockerActionNeedsConfirm('restart', { swarmTask: true }), true)
assert.equal(dockerActionNeedsConfirm('restart', { swarmTask: false }), false)
assert.equal(dockerActionNeedsConfirm('start'), false)
assert.equal(dockerActionNeedsConfirm('stop'), false)
assert.equal(dockerActionNeedsConfirm('open'), false)
assert.equal(toolboxDockerIpc('rm'), 'containerAction')
assert.equal(toolboxDockerIpc('open'), 'openDockerDetail')
assert.equal(toolboxDockerIpc('compose-down'), 'composeAction')
assert.equal(toolboxDockerIpc('swarm-update'), 'swarmAction')

const tab = readFileSync('src/renderer/src/components/DockerToolboxTab.tsx', 'utf8')
const tools = readFileSync('src/renderer/src/components/ServerToolsModal.tsx', 'utf8')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
const branch = readFileSync('src/renderer/src/components/SessionDockerBranch.tsx', 'utf8')
assert.ok(tab.includes('dockerActionNeedsConfirm'))
assert.ok(tab.indexOf('dockerActionNeedsConfirm') < tab.indexOf('containerAction'))
assert.ok(tab.includes('composeAction'))
assert.ok(tab.includes("swarmAction(sessionId, row.id, 'restart')"))
assert.ok(tab.includes('listTree'))
assert.ok(tab.includes('EmptyState'))
assert.ok(tab.includes('toolbox-docker-empty'))
assert.ok(tab.includes('toolbox-docker-missing'))
assert.equal(tab.includes('暂无'), false)
assert.equal(tab.includes('docker.install'), false)
assert.ok(tools.includes('DockerToolboxTab'))
assert.equal(tools.includes('function DockerTab'), false)
assert.ok(app.includes('onOpenDocker'))
assert.ok(app.includes('openDockerDetail'))
assert.ok(branch.includes('dockerStatusTone'))
assert.equal(branch.includes('docker-status-icon--'), true)

for (const key of [
  'st.docker.empty',
  'st.docker.noMatch',
  'st.docker.search',
  'st.docker.name',
  'st.docker.ports',
  'st.docker.count',
  'st.docker.compose',
  'st.docker.swarm',
  'st.docker.containers',
  'st.docker.open',
  'st.docker.up',
  'st.docker.down',
  'st.docker.update',
  'docker.missing'
] as const) {
  assert.ok(zh(key).length > 0, key)
  assert.ok(en(key).length > 0, key)
  assert.equal(zh(key).includes('暂无'), false, key)
}
assert.equal(zh('st.docker.empty'), '这台主机上还没有容器')
assert.equal(en('docker.missing'), 'Docker not detected on this host')

console.log('polish-5 docker toolbox ok')
