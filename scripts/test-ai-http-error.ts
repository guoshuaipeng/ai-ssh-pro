/** AI provider HTTP failures speak human, not raw OpenAI JSON. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aiHttpErrorMessages,
  friendlyAiHttpError,
  parseAiHttpErrorMessage
} from '../src/shared/ai-http-error'
import { isEngineerLeak } from '../src/shared/product-error'
import { friendlyErrorMessage } from '../src/renderer/src/lib/friendly-error'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.63')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-http-error/)

assert.equal(parseAiHttpErrorMessage('HTTP 401: Invalid API key')?.status, 401)
assert.equal(friendlyAiHttpError(401, 'Incorrect API key provided', 'zh-CN').includes('API Key'), true)
assert.equal(friendlyAiHttpError(401, '', 'en').toLowerCase().includes('api key'), true)
assert.equal(friendlyAiHttpError(429, 'Rate limit exceeded', 'zh-CN').includes('429'), true)
assert.equal(friendlyAiHttpError(404, 'model does not exist', 'en').toLowerCase().includes('model'), true)
assert.equal(friendlyAiHttpError(503, '', 'en').includes('503'), true)
assert.equal(friendlyAiHttpError(0, 'fetch failed', 'zh-CN').includes('AI'), true)

for (const locale of ['zh-CN', 'en'] as const) {
  for (const status of [401, 403, 429, 404, 500]) {
    const line = friendlyAiHttpError(status, '', locale)
    assert.equal(isEngineerLeak(line), false, line)
    assert.equal(/^HTTP \d+:/.test(line), false)
  }
}

const legacy = friendlyErrorMessage('HTTP 401: {"error":{"message":"Incorrect API key provided"}}', 'zh-CN')
assert.match(legacy, /API Key|密钥/)
assert.equal(legacy.includes('Error invoking'), false)

const stream = readFileSync('src/main/ai-stream.ts', 'utf8')
assert.match(stream, /aiHttpErrorMessages/)
assert.equal(stream.includes('HTTP ${res.status}: ${t.slice(0, 500)}'), false)

const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
assert.match(agent, /aiHttpErrorMessages/)

const ccm = readFileSync('src/renderer/src/components/ConnectionConfigModal.tsx', 'utf8')
assert.match(ccm, /conn-browse-key/)
assert.match(ccm, /pickPrivateKey/)
assert.match(ccm, /conn\.keyHint/)

const preload = readFileSync('src/preload/index.ts', 'utf8')
assert.match(preload, /localFs:pickPrivateKey/)

const main = readFileSync('src/main/index.ts', 'utf8')
assert.match(main, /localFs:pickPrivateKey/)
assert.match(main, /\.ssh/)

const msgs = aiHttpErrorMessages(401, 'unauthorized')
assert.ok(msgs.zh.length > 10 && msgs.en.length > 10)

console.log('test-ai-http-error ok')
