/** Batch connect end toast covers partial fail and single ok. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /summary\.fail === 1 && summary\.ok > 0/)
assert.match(app, /summary\.fail === 0 && summary\.ok >= 1/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.37')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-batch-connect-toast-partial/)
console.log('test-batch-connect-toast-partial ok')
