/**
 * Regression: Tauri briefly treated missing SSH exit status as failure and put
 * raw `docker ps --format json` NDJSON into containersError (red blob under 容器).
 */
import assert from 'node:assert/strict'
import { humanizeDockerError, toolboxDockerList } from '../src/shared/docker-toolbox'
import type { DockerTreeResult } from '../src/shared/ipc'

const rawJson =
  '{"Command":"/bin/sh -c \'exec ja...\'","CreatedAt":"2026-11-02 11:12:28 +0800 CST","ID":"98f1ed8995fe","Image":"snowy-zhqhmobile-app:eb89bb02-5487","Labels":"com.docker.swarm.service.name=snowy-zhqhmobile-app","Names":"snowy-zhqhmobile-app.1.hvvige809"}'

assert.equal(humanizeDockerError(rawJson), '读取容器列表失败，请刷新重试')
assert.equal(humanizeDockerError('permission denied while trying to connect'), 'permission denied while trying to connect')

const poisoned: DockerTreeResult = {
  containers: [],
  composeProjects: [
    { name: 'loki', status: 'running(1)', containers: [] },
    { name: 'openresty', status: 'running(1)', containers: [] }
  ],
  swarm: { active: false, manager: false, stacks: [] },
  containersError: rawJson
}
const model = toolboxDockerList(poisoned)
const alone = model.groups.find((g) => g.id === 'standalone')
assert.ok(alone)
assert.equal(alone!.error, '读取容器列表失败，请刷新重试')
assert.ok(!(alone!.error || '').includes('98f1ed8995fe'))
// Compose still visible; do not paint JSON into compose error
const compose = model.groups.find((g) => g.id === 'compose')
assert.ok(compose && compose.count === 2)

const healthy: DockerTreeResult = {
  containers: [
    {
      id: '98f1ed8995fe',
      name: 'snowy-zhqhmobile-app.1.hvvige809',
      image: 'snowy-zhqhmobile-app:eb89bb02-5487',
      state: 'running',
      status: 'Up 2 hours',
      shortStatus: 'running',
      ports: '',
      swarmService: 'snowy-zhqhmobile-app'
    }
  ],
  composeProjects: [{ name: 'loki', status: 'running(1)', containers: [] }],
  swarm: { active: true, manager: true, stacks: [] }
}
const ok = toolboxDockerList(healthy)
assert.equal(ok.failed, false)
const aloneOk = ok.groups.find((g) => g.id === 'standalone')
assert.ok(aloneOk && aloneOk.rows.length === 1)
assert.equal(aloneOk!.error, undefined)

console.log('test-docker-ps-json-error: ok')
