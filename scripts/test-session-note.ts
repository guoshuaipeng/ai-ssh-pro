/** Session note normalize/preview + UI wiring. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SESSION_NOTE_MAX, normalizeSessionNote, sessionNotePreview } from '../src/shared/session-note'
import { filterProfiles } from '../src/renderer/src/lib/session-filter'

assert.equal(normalizeSessionNote(''), '')
assert.equal(normalizeSessionNote('  hello   world  '), 'hello world')
assert.equal(normalizeSessionNote('x'.repeat(200)).length, SESSION_NOTE_MAX)
assert.equal(sessionNotePreview('short'), 'short')
assert.equal(sessionNotePreview('x'.repeat(50), 40).endsWith('…'), true)
assert.equal(sessionNotePreview(undefined), '')

const withNote = [
  { id: '1', label: 'web', host: '10.0.0.1', username: 'ops', port: 22, note: 'prod gateway weekend' },
  { id: '2', label: 'db', host: '10.0.0.2', username: 'dba', port: 22 }
]
assert.deepEqual(filterProfiles(withNote, 'weekend').map((x) => x.label), ['web'])
assert.equal(filterProfiles(withNote, 'gateway').length, 1)

const ipc = readFileSync('src/shared/ipc.ts', 'utf8')
assert.match(ipc, /note\?: string/)

const modal = readFileSync('src/renderer/src/components/ConnectionConfigModal.tsx', 'utf8')
assert.match(modal, /conn-session-note/)
assert.match(modal, /conn\.note/)
assert.match(modal, /sessionNote/)

const sdb = readFileSync('src/renderer/src/components/SessionDockerBranch.tsx', 'utf8')
assert.match(sdb, /profile-note/)
assert.match(sdb, /sessionNotePreview/)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /normalizeSessionNote/)
assert.match(app, /sessionNote=\{sessionNote\}/)

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.match(css, /\.profile-note/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /'conn\.note'/)
assert.match(i18n, /'conn\.notePh'/)
assert.match(i18n, /'conn\.noteHint'/)

const filterSrc = readFileSync('src/renderer/src/lib/session-filter.ts', 'utf8')
assert.match(filterSrc, /matches\(p\.note/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-session-note/)

console.log('test-session-note ok')
