/** turnBlocks toasts on enable as well as disable. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const blocks = readFileSync('src/renderer/src/components/TerminalBlocks.tsx', 'utf8')
assert.match(blocks, /m2\.blocksOn/)
assert.match(blocks, /m2\.blocksOff/)
assert.match(blocks, /showToast\(tg\(on \? 'm2\.blocksOn' : 'm2\.blocksOff'\)\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("m2.blocksOn': '已开启输出分块'"))
assert.ok(i18n.includes("m2.blocksOn': 'Output blocks on'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.40')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-blocks-on-toast/)
console.log('test-blocks-on-toast ok')
