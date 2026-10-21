import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const files = ['HostInventoryModal', 'GateTimelineTab', 'AlertRulesModal', 'AuditExportModal', 'FolderSyncModal', 'HostSafetyCard', 'JumpChainEditor']
let n = 0
for (const f of files) {
  const s = readFileSync(`src/renderer/src/components/${f}.tsx`, 'utf8')
  assert.equal(s.includes('<select'), false, f + ' still has native select'); n++
  assert.ok(s.includes("import Select from './ui/Select'"), f + ' imports Select'); n++
}
const base = JSON.parse(readFileSync('scripts/native-select-baseline.json', 'utf8'))
assert.ok(base.count <= 7); n++
console.log(`test-native-select-c49: ${n} passed`)