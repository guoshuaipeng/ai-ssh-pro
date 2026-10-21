import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// NS1: settings-area selects are themed
for (const [f, ids] of [
  ['src/renderer/src/components/SettingsPanel.tsx', ['w3-snap-keep']],
  ['src/renderer/src/components/ReconnectPolicySection.tsx', ['l9-mode', 'l9-keepalive']],
  ['src/renderer/src/components/TerminalPrefsModal.tsx', ['term-theme']]
] as const) {
  const s = readFileSync(f, 'utf8')
  assert.ok(!/<select\b/.test(s), `${f}: no native select`)
  for (const id of ids) assert.match(s, new RegExp(`testId="${id}"`), `${f}: ${id}`)
}
assert.ok(JSON.parse(readFileSync('scripts/native-select-baseline.json', 'utf8')).count <= 27, 'ratchet')
console.log('test-native-select-settings ok')