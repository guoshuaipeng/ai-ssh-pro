import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const kh = readFileSync('src/renderer/src/components/KnownHostsModal.tsx', 'utf8')
// HK2: exactly one import entry (page header); empty state has no second CTA
assert.equal(kh.split("{tg('kh.import')}").length - 1, 1, 'single import button')
assert.ok(!kh.includes('kh-empty-import'), 'no duplicate import in empty state')
assert.match(kh, /<Button data-testid="kh-lookup-run"/)

const modal = readFileSync('src/renderer/src/components/Modal.tsx', 'utf8')
assert.match(modal, /import \{ closeContextMenu \} from '.\/ContextMenu'/)
assert.match(modal, /if \(open && !embedded\) closeContextMenu\(\)/)

const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.ctx-menu-root \{ position: fixed; z-index: var\(--z-menu\); \}/)
assert.match(css, /\.kh-panel > \* \{ flex-shrink: 0; \}/)
console.log('test-host-keys-layers ok')
