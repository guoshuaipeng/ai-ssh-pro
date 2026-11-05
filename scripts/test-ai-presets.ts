/** B2: provider presets — shape, verified endpoints, keyless local servers. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { AI_PRESETS, aiAuthHeaders, findPreset, hasUsableKey, keyOptional, matchPreset, planApplyPreset, presetGroup } from '../src/shared/ai-presets'
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
  // pinned to what the official pages showed on 2026-10-23
  assert.equal(findPreset('deepseek')?.baseURL, 'https://api.deepseek.com')
  assert.equal(findPreset('dashscope')?.baseURL, 'https://dashscope.aliyuncs.com/compatible-mode/v1')
  assert.equal(findPreset('moonshot')?.baseURL, 'https://api.moonshot.cn/v1')
  assert.equal(findPreset('zhipu')?.baseURL, 'https://open.bigmodel.cn/api/paas/v4')
  assert.equal(findPreset('ollama')?.baseURL, 'http://localhost:11434/v1')
  assert.equal(findPreset('siliconflow')?.baseURL, 'https://api.siliconflow.cn/v1')
  assert.equal(findPreset('modelscope')?.baseURL, 'https://api-inference.modelscope.cn/v1')
  assert.equal(findPreset('lmstudio')?.baseURL, 'http://localhost:1234/v1')
  assert.equal(findPreset('openrouter')?.baseURL, 'https://openrouter.ai/api/v1')
  assert.equal(findPreset('lmstudio')?.keyRequired, false)
  assert.equal(findPreset('siliconflow')?.keyRequired, true)
  assert.ok(AI_PRESETS.length >= 10, 'at least 10 presets')
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

{
  assert.equal(presetGroup(findPreset('deepseek')!), 'cloud')
  assert.equal(presetGroup(findPreset('ollama')!), 'local')
  assert.equal(presetGroup(findPreset('lmstudio')!), 'local')
  const cloud = AI_PRESETS.filter((p) => presetGroup(p) === 'cloud')
  const local = AI_PRESETS.filter((p) => presetGroup(p) === 'local')
  assert.ok(cloud.length >= 6 && local.length >= 2)
  ok('presetGroup cloud vs local')
}
{
  const deepseek = findPreset('deepseek')!
  const ollama = findPreset('ollama')!
  const blank = { id: 'p1', name: 'New', baseURL: '', apiKey: '', modelList: ['qwen-max'] }
  const fill = planApplyPreset({
    providers: [blank],
    activeProviderId: 'p1',
    preset: deepseek,
    localeName: 'DeepSeek',
    newId: 'p2'
  })
  assert.equal(fill.action, 'fill')
  if (fill.action === 'fill') {
    assert.equal(fill.provider.baseURL, deepseek.baseURL)
    assert.deepEqual(fill.provider.modelList, deepseek.models)
    assert.equal(fill.hint, 'filled-need-key')
  }
  const keyed = {
    id: 'p1',
    name: 'DeepSeek',
    baseURL: deepseek.baseURL,
    apiKey: 'sk-keep',
    modelList: ['deepseek-flash']
  }
  const switchPlan = planApplyPreset({
    providers: [keyed],
    activeProviderId: 'p1',
    preset: deepseek,
    localeName: 'DeepSeek',
    newId: 'p9'
  })
  assert.equal(switchPlan.action, 'switch')
  if (switchPlan.action === 'switch') {
    assert.equal(switchPlan.providerId, 'p1')
    assert.equal(switchPlan.hint, 'switched-has-key')
  }
  const create = planApplyPreset({
    providers: [keyed],
    activeProviderId: 'p1',
    preset: ollama,
    localeName: 'Ollama',
    newId: 'p3'
  })
  assert.equal(create.action, 'create')
  if (create.action === 'create') {
    assert.equal(create.providers.length, 2)
    assert.equal(create.provider.baseURL, ollama.baseURL)
    assert.equal(create.hint, 'filled-keyless')
    assert.equal(create.providers[0]!.apiKey, 'sk-keep', 'keyed provider kept')
  }
  ok('planApplyPreset fill / switch / create')
}
{
  const form = readFileSync('src/renderer/src/components/AiConfigForm.tsx', 'utf8')
  assert.ok(form.includes('planApplyPreset'))
  assert.ok(form.includes('data-testid="ai-preset-next"'))
  assert.ok(form.includes('ai-preset-group-${group}'))
  assert.ok(form.includes("tg('aiPreset.groupCloud')"))
  assert.ok(form.includes("tg('aiPreset.groupLocal')"))
  assert.ok(form.includes("tg('aiPreset.nextNeedKey')"))
  const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
  for (const k of ['aiPreset.groupCloud', 'aiPreset.groupLocal', 'aiPreset.needKey', 'aiPreset.noKey', 'aiPreset.nextNeedKey', 'aiPreset.nextKeyless', 'aiPreset.switchedHasKey']) {
    assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
  }
  ok('AiConfigForm + i18n wire-up')
}

console.log(`\n${n} passed`)
