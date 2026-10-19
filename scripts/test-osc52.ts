/** OSC 52 parse + prefs default. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { decodeOsc52Base64, parseOsc52Payload } from '../src/shared/osc52'
import { TERMINAL_PREFS_DEFAULTS } from '../src/shared/ipc'
import { translate } from '../src/renderer/src/lib/i18n'

assert.equal(TERMINAL_PREFS_DEFAULTS.osc52Clipboard, true)

const hello = Buffer.from('Hello', 'utf8').toString('base64')
assert.equal(decodeOsc52Base64(hello), 'Hello')
assert.equal(parseOsc52Payload(`c;${hello}`).kind, 'write')
assert.equal((parseOsc52Payload(`c;${hello}`) as { text: string }).text, 'Hello')
assert.equal(parseOsc52Payload('c;?').kind, 'query')
assert.equal(parseOsc52Payload('c;').kind, 'clear')
assert.equal(parseOsc52Payload('nope').kind, 'ignore')

const zh = Buffer.from('你好', 'utf8').toString('base64')
assert.equal(decodeOsc52Base64(zh), '你好')

const pane = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
assert.match(pane, /registerOscHandler\(52/)
assert.match(pane, /parseOsc52Payload/)
assert.match(pane, /osc52EnabledRef/)

const prefs = readFileSync('src/renderer/src/components/TerminalPrefsModal.tsx', 'utf8')
assert.match(prefs, /osc52-clipboard/)
assert.match(prefs, /term\.osc52/)

assert.ok(translate('zh-CN', 'term.osc52').length > 0)
assert.ok(translate('en', 'term.osc52Hint').length > 0)

const store = readFileSync('src/main/app-store.ts', 'utf8')
assert.match(store, /osc52Clipboard/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-osc52/)

console.log('test-osc52: ok')
