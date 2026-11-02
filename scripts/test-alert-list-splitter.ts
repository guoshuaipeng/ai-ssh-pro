import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const bench = readFileSync('src/renderer/src/components/AlertWorkbenchTab.tsx', 'utf8')
assert.match(bench, /LayoutResizer/)
assert.match(bench, /aiss-alert-list-width-v1/)
assert.match(bench, /style=\{\{ width: listWidth \}\}/)

const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.l2-list \{[^}]*min-width:\s*240px/)
assert.match(css, /\.l2-body > \.layout-resizer/)

const menus = readFileSync('src/shared/menus.ts', 'utf8')
assert.match(menus, /type: 'sub'/)
assert.match(menus, /view-tabs/)
assert.match(menus, /session-reconnect/)

const bridge = readFileSync('src/renderer/src/tauri-bridge.ts', 'utf8')
assert.match(bridge, /getRoot:\s*\(\)\s*=>\s*invoke<string>\('inventory_get_root'\)/)
assert.match(bridge, /Array\.isArray\(s\?\.providers\)/)

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /const providers = Array\.isArray\(s\?\.providers\)/)

const secret = readFileSync('src-tauri/src/secret_crypto.rs', 'utf8')
assert.match(secret, /enc:v1:/)
assert.match(secret, /decrypt_ai_settings/)

console.log('test-alert-list-splitter: ok')
