import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const src = readFileSync('src/renderer/src/components/WindowControls.tsx', 'utf8')
assert.ok(!/^import \{ getCurrentWindow \} from '@tauri-apps\/api\/window'/m.test(src), 'no top-level tauri window import')
assert.ok(src.includes("import('@tauri-apps/api/window')"), 'dynamic import')
assert.ok(src.includes('hasTauri') && src.includes('__TAURI_INTERNALS__'))
assert.ok(src.includes('if (!win) return null'))
console.log('test-window-controls-guard: OK')
