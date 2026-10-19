/** MCP inventory --export/--import CLI + tools registration. */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = mkdtempSync(join(tmpdir(), 'aiss-mcp-'))
const script = join(process.cwd(), 'scripts/mcp-inventory-server.mjs')
try {
  const hosts = join(root, 'hosts', 'alpha')
  mkdirSync(hosts, { recursive: true })
  writeFileSync(
    join(hosts, 'meta.json'),
    JSON.stringify({
      id: 'alpha',
      title: 'Alpha',
      host: '10.0.0.1',
      port: 22,
      username: 'root',
      privateKeyPath: '/secret/id_ed25519',
      createdAt: 1,
      updatedAt: 1
    }) + '\n'
  )
  writeFileSync(join(hosts, 'services.json'), JSON.stringify({ hostId: 'alpha', updatedAt: 1, services: [] }) + '\n')
  writeFileSync(join(hosts, 'notes.md'), 'hello\n')
  writeFileSync(join(root, 'index.json'), JSON.stringify({ version: 1, hosts: [{ id: 'alpha', title: 'Alpha', updatedAt: 1 }] }) + '\n')

  const env = { ...process.env, AISS_INVENTORY_ROOT: root }
  const list = spawnSync(process.execPath, [script, '--list'], { encoding: 'utf8', env })
  assert.equal(list.status, 0, list.stderr)
  const listed = JSON.parse(list.stdout)
  assert.equal(listed.count, 1)

  const outFile = join(root, 'backup.json')
  const exp = spawnSync(process.execPath, [script, '--export', outFile], { encoding: 'utf8', env })
  assert.equal(exp.status, 0, exp.stderr)
  const exported = JSON.parse(readFileSync(outFile, 'utf8'))
  assert.equal(exported.kind, 'ai-ssh-pro-inventory')
  assert.equal(exported.hosts.length, 1)
  assert.ok(!JSON.stringify(exported).includes('id_ed25519'))
  assert.equal('privateKeyPath' in exported.hosts[0].meta, false)

  // wipe and import
  rmSync(join(root, 'hosts'), { recursive: true, force: true })
  mkdirSync(join(root, 'hosts'), { recursive: true })
  writeFileSync(join(root, 'index.json'), JSON.stringify({ version: 1, hosts: [] }) + '\n')
  const empty = spawnSync(process.execPath, [script, '--list'], { encoding: 'utf8', env })
  const emptyPayload = JSON.parse(empty.stdout)
  assert.equal(emptyPayload.count, 0)
  assert.ok(String(emptyPayload.hint || '').length > 0)

  const imp = spawnSync(process.execPath, [script, '--import', outFile], { encoding: 'utf8', env })
  assert.equal(imp.status, 0, imp.stderr)
  const impResult = JSON.parse(imp.stdout)
  assert.equal(impResult.upserted, 1)

  const src = readFileSync(script, 'utf8')
  assert.match(src, /export_inventory/)
  assert.match(src, /import_inventory/)
  const guide = readFileSync('src/renderer/src/components/McpGuidePanel.tsx', 'utf8')
  assert.match(guide, /export_inventory/)

  const help = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8', env })
  assert.match(help.stdout, /--export/)
  assert.match(help.stdout, /export_inventory/)

  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
  assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-mcp-inventory-export/)

  console.log('test-mcp-inventory-export: ok')
} finally {
  rmSync(root, { recursive: true, force: true })
}
