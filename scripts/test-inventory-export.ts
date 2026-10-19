/** Inventory sync-free export/import (no privateKeyPath). */
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { InventoryStore } from '../src/main/inventory-store'

const root = mkdtempSync(join(tmpdir(), 'aiss-inv-'))
try {
  const store = new InventoryStore(root)
  const a = store.upsert({
    title: 'Alpha',
    host: '10.0.0.1',
    port: 22,
    username: 'root',
    privateKeyPath: 'C:/Users/me/.ssh/id_ed25519',
    tags: ['prod'],
    services: [{ name: 'nginx', kind: 'systemd', unit: 'nginx.service' }],
    notesMarkdown: 'keep notes'
  })
  store.upsert({
    title: 'Beta',
    host: '10.0.0.2',
    username: 'deploy',
    notesMarkdown: ''
  })

  const bundle = store.exportBundle()
  assert.equal(bundle.version, 1)
  assert.equal(bundle.kind, 'ai-ssh-pro-inventory')
  assert.equal(bundle.hosts.length, 2)
  const alpha = bundle.hosts.find((h) => h.meta.title === 'Alpha')
  assert.ok(alpha)
  assert.equal(alpha!.notesMarkdown, 'keep notes')
  assert.equal(alpha!.services[0]?.name, 'nginx')
  assert.equal('privateKeyPath' in alpha!.meta, false)
  assert.ok(!JSON.stringify(bundle).includes('id_ed25519'))

  // skip existing on re-import
  const again = store.importBundle(bundle, { overwrite: false })
  assert.equal(again.upserted, 0)
  assert.equal(again.skipped, 2)

  // overwrite updates notes for Alpha by id
  const patched = structuredClone(bundle)
  const alphaSlot = patched.hosts.find((h) => h.meta.id === a.meta.id)
  assert.ok(alphaSlot)
  alphaSlot!.notesMarkdown = 'updated'
  const ow = store.importBundle(patched, { overwrite: true })
  assert.ok(ow.upserted >= 1)
  const got = store.get(a.meta.id)
  assert.equal(got?.notesMarkdown, 'updated')
  assert.equal(got?.meta.privateKeyPath, 'C:/Users/me/.ssh/id_ed25519')

  // wire checks
  const main = readFileSync('src/main/index.ts', 'utf8')
  assert.match(main, /inventory:exportToFile/)
  assert.match(main, /inventory:importFromFile/)
  const modal = readFileSync('src/renderer/src/components/HostInventoryModal.tsx', 'utf8')
  assert.match(modal, /inventory-export/)
  assert.match(modal, /inv\.export/)
  const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
  assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-inventory-export/)

  console.log('test-inventory-export: ok')
} finally {
  rmSync(root, { recursive: true, force: true })
}
