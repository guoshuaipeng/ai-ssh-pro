/** AI provider Test connection helpers (no network). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aiProviderTestBody,
  aiProviderTestUrl,
  classifyAiProviderTestResponse,
  networkFailResult,
  normalizeAiBaseUrl,
  validateAiProviderTestInput,
  validationFailMessages
} from '../src/shared/ai-provider-test'

assert.equal(normalizeAiBaseUrl(' https://api.example.com/v1/ '), 'https://api.example.com/v1')
assert.equal(aiProviderTestUrl('https://api.example.com/v1/'), 'https://api.example.com/v1/chat/completions')

assert.deepEqual(validateAiProviderTestInput({ baseURL: '', apiKey: 'k', model: 'm' }), { ok: false, reason: 'baseURL' })
assert.deepEqual(validateAiProviderTestInput({ baseURL: 'https://x/v1', apiKey: '', model: 'm' }), { ok: false, reason: 'apiKey' })
assert.deepEqual(validateAiProviderTestInput({ baseURL: 'https://x/v1', apiKey: 'k', model: '' }), { ok: false, reason: 'model' })
assert.deepEqual(validateAiProviderTestInput({ baseURL: 'https://x/v1', apiKey: 'k', model: 'm' }), { ok: true })

const body = aiProviderTestBody('qwen-max')
assert.equal(body.model, 'qwen-max')
assert.equal(body.max_tokens, 1)
assert.equal(body.stream, false)

const ok = classifyAiProviderTestResponse(200, '{}', 42.2, 'qwen-max')
assert.equal(ok.ok, true)
if (ok.ok) {
  assert.equal(ok.latencyMs, 42)
  assert.equal(ok.model, 'qwen-max')
}

const fail = classifyAiProviderTestResponse(401, 'Incorrect API key', 10, 'm')
assert.equal(fail.ok, false)
if (!fail.ok) {
  assert.match(fail.messageZh, /API Key|密钥/)
  assert.match(fail.messageEn.toLowerCase(), /api key/)
}

const timed = networkFailResult(new Error('The operation was aborted'))
assert.equal(timed.ok, false)
if (!timed.ok) assert.equal(timed.reason, 'timeout')

assert.match(validationFailMessages('baseURL').zh, /Base URL/)
assert.match(validationFailMessages('apiKey').en.toLowerCase(), /api key/)

const form = readFileSync('src/renderer/src/components/AiConfigForm.tsx', 'utf8')
assert.match(form, /ai-provider-test/)
assert.match(form, /testProvider/)

const preload = readFileSync('src/preload/index.ts', 'utf8')
assert.match(preload, /ai:provider:test/)

const main = readFileSync('src/main/index.ts', 'utf8')
assert.match(main, /ai:provider:test/)
assert.match(main, /AI_PROVIDER_TEST_TIMEOUT_MS/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: { test: string; 'test:parts'?: string } }
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-ai-provider-test/)

console.log('test-ai-provider-test ok')
