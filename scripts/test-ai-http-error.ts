/** AI provider HTTP failures speak human, not raw OpenAI JSON. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  aiErrorWantsSettings,
  aiHttpErrorMessages,
  friendlyAiHttpError,
  parseAiHttpErrorMessage
} from '../src/shared/ai-http-error.ts'
import { isEngineerLeak } from '../src/shared/product-error.ts'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.8.0')
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

const legacyRaw = 'HTTP 401: {\"error\":{\"message\":\"Incorrect API key provided\"}}'
const parsed = parseAiHttpErrorMessage(legacyRaw)
assert.ok(parsed)
assert.match(friendlyAiHttpError(parsed!.status, parsed!.body, 'zh-CN'), /API Key|密钥/)

const stream = readFileSync('src/main/ai-stream.ts', 'utf8')
assert.match(stream, /aiHttpErrorMessages/)
assert.equal(stream.includes("HTTP ${res.status}:"), false)

const agent = readFileSync('src/main/ai-interactive-agent.ts', 'utf8')
assert.match(agent, /aiHttpErrorMessages/)

const msgs = aiHttpErrorMessages(401, 'unauthorized')
assert.ok(msgs.zh.length > 10 && msgs.en.length > 10)

assert.equal(aiErrorWantsSettings('AI_HTTP_401'), true)
assert.equal(aiErrorWantsSettings('AI_HTTP_403'), true)
assert.equal(aiErrorWantsSettings('AI_HTTP_404'), true)
assert.equal(aiErrorWantsSettings('AI_HTTP_0'), true)
assert.equal(aiErrorWantsSettings('AI_PROVIDER'), true)
assert.equal(aiErrorWantsSettings('AI_HTTP_429'), false)
assert.equal(aiErrorWantsSettings('AI_HTTP_503'), false)
assert.equal(aiErrorWantsSettings(undefined), false)

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.match(panel, /aiErrorWantsSettings/)
assert.match(panel, /ai-error-open-settings/)
assert.match(panel, /data-primary=\{openSettings \? 'settings' : 'retry'\}/)
assert.match(panel, /friendlyError\(raw\)/)
assert.match(panel, /errorCode: fe\.code/)
assert.match(panel, /a1\.goSettings/)

console.log('test-ai-http-error ok')
