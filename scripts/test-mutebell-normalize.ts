import { createRequire } from 'module'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// smoke: shared file exists and exports symbol
const src = readFileSync('src/shared/terminal-prefs.ts','utf8')
assert.match(src, /export function normalizeTerminalPrefs/)
assert.match(src, /muteBell/)
const bridge = readFileSync('src/renderer/src/tauri-bridge.ts','utf8')
assert.match(bridge, /return normalizeTerminalPrefs\(v\)/)
assert.match(bridge, /return next/)
assert.equal(bridge.includes("cursorBlink: true"), false)
console.log('test-mutebell-normalize: ok')
