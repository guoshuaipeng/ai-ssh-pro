/** Status-bar session note chip when profile has a note. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { sessionNotePreview } from '../src/shared/session-note'

assert.equal(sessionNotePreview(''), '')
assert.equal(sessionNotePreview('hello world', 5), 'hell…')

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /statusbar-note/)
assert.match(app, /sessionNotePreview/)
assert.match(app, /editSessionNote/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'sb.note'"))
assert.ok(i18n.includes("'sb.noteTip'"))
assert.ok((i18n.match(/'sb\.note'/g) || []).length >= 2)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.45')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-statusbar-note/)
console.log('test-statusbar-note ok')
