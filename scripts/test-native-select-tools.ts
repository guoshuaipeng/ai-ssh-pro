import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// NS2: server tools + alert workbench selects themed; ratchet <= 17
for (const [f, ids] of [
  ['src/renderer/src/components/ServerToolsModal.tsx', ['st-session', 'st-sort', 'st-svc-filter', 'st-proto', 'st-log-source', 'st-lines', 'st-level']],
  ['src/renderer/src/components/AlertWorkbenchTab.tsx', ['l2-bell-mode', 'l2-host', 'l2-rule']]
] as const) {
  const s = readFileSync(f, 'utf8')
  assert.ok(!/<select\b/.test(s), `${f}: no native select`)
  for (const id of ids) assert.match(s, new RegExp(`testId="${id}"`), `${f}: ${id}`)
}
assert.ok(JSON.parse(readFileSync('scripts/native-select-baseline.json', 'utf8')).count <= 17, 'ratchet')
console.log('test-native-select-tools ok')