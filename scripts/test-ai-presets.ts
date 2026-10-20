/** B2: provider presets — shape, verified endpoints, keyless local servers. */
import assert from 'node:assert/strict'
import { AI_PRESETS, aiAuthHeaders, findPreset, hasUsableKey, keyOptional, matchPreset } from '../src/shared/ai-presets'
import { validateAiProviderTestInput } from '../src/shared/ai-provider-test'

let n = 0
const ok = (s: string) => {
  n++
  console.log('ok -', s)
}

{
  const ids = new Set<string>()
  for (const p of AI_PRESETS) {
    assert.ok(!ids.has(p.id), `dup ${p.id}`)
    ids.add(p.id)
    assert.ok(p.name.zh && p.name.en)
    assert.ok(/^https?:\/\//.test(p.baseURL) && !p.baseURL.endsWith('/'), p.baseURL)
    assert.ok(!/chat\/completions/.test(p.baseURL), 'base only')
    assert.ok(p.models.length > 0)
    assert.ok(/^https:\/\//.test(p.docsUrl), 'every preset cites its docs')
    assert.equal(p.keyRequired, !keyOptional(p.baseURL), `${p.id}: keyRequired matches loopback`)
  }
  ok('preset shape and docs links')
}
{
  // pinned to what the official pages showed on 2026-10-20
  assert.equal(findPreset('deepseek')?.baseURL, 'https://api.deepseek.com')
  assert.equal(findPreset('dashscope')?.baseURL, 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  assert.equal(findPreset('moonshot')?.baseURL, 'https://api.moonshot.cn/v1')
  assert.equal(findPreset('zhipu')?.baseURL, 'https://open.bigmodel.cn/api/paas/v4')
  assert.equal(findPreset('ollama')?.baseURL, 'http://localhost:11434/v1')
  ok('verified endpoints are pinned')
}
{
  assert.equal(keyOptional('http://localhost:11434/v1'), true)
  assert.equal(keyOptional('http://127.0.0.1:1234/v1'), true)
  assert.equal(keyOptional('http://[::1]:11434/v1'), true)
  assert.equal(keyOptional('https://api.deepseek.com'), false)
  assert.equal(keyOptional('http://localhost.evil.com/v1'), false)
  assert.equal(keyOptional('not a url'), false)
  assert.equal(hasUsableKey('https://api.deepseek.com', ' '), false)
  assert.equal(hasUsableKey('http://localhost:11434/v1', ''), true)
  assert.deepEqual(aiAuthHeaders(''), {})
  assert.deepEqual(aiAuthHeaders(' sk-1 '), { Authorization: 'Bearer sk-1' })
  ok('keyless only for loopback')
}
{
  assert.deepEqual(validateAiProviderTestInput({ baseURL: 'http://localhost:11434/v1', apiKey: '', model: 'qwen3:8b' }), { ok: true })
  assert.deepEqual(validateAiProviderTestInput({ baseURL: 'https://api.moonshot.cn/v1', apiKey: '', model: 'kimi-k3' }), { ok: false, reason: 'apiKey' })
  ok('test connection allows a keyless local server')
}
{
  assert.equal(matchPreset('https://api.moonshot.cn/v1/')?.id, 'moonshot')
  assert.equal(matchPreset('https://example.com/v1'), undefined)
  ok('matchPreset')
}
console.log(`\n${n} passed`)
