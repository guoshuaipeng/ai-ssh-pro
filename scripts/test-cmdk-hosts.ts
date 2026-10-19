/** CmdK lists recent/saved hosts for one-click open. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const pal = readFileSync('src/renderer/src/lib/palette.ts', 'utf8')
assert.match(pal, /sessionProfileId\?:/)

const cp = readFileSync('src/renderer/src/components/CommandPalette.tsx', 'utf8')
assert.match(cp, /hostEntries/)
assert.match(cp, /onOpenHost/)
assert.match(cp, /sessionProfileId/)
assert.match(cp, /cmdp\.hosts/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /cmdkHostEntries/)
assert.match(app, /hostEntries=\{cmdkHostEntries\}/)
assert.match(app, /onOpenHost=/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'cmdp.hosts'"))
assert.ok(i18n.includes("'cmdp.openRecent'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-cmdk-hosts/)
console.log('test-cmdk-hosts ok')
