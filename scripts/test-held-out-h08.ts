/**
 * Held-out H08 — empty / error actionable CTAs.
 * Loads tests/fixtures/held-out/h08-empty-error.json.
 *
 * Run: npx tsx --tsconfig tsconfig.node.json scripts/test-held-out-h08.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  aiEmptyGate,
  aiErrorPrimaryCta,
  aiNeedsModelPick,
  resolveAiModelLabel
} from '../src/shared/ai-empty-error'
import { friendlyAiHttpError } from '../src/shared/ai-http-error'
import { isEngineerLeak } from '../src/shared/product-error'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const norm = (rel: string) => readFileSync(join(root, rel), 'utf8').replace(/\r\n/g, '\n')
const load = <T>(rel: string): T => JSON.parse(readFileSync(join(root, rel), 'utf8')) as T

type H08Fix = {
  id: string
  gates: Array<{ hasApiKey: boolean; expect: 'needs_config' | 'ready' }>
  errorPrimary: Array<{ code: string | null; expect: 'settings' | 'retry' }>
  modelMissing: Array<{ activeModel: string; modelList: string[]; expect: boolean }>
  wiring: {
    emptyState: string[]
    configuredEmpty: string[]
    errorCard: string[]
    modelMissingBanner: string[]
    moduleExports: string[]
  }
}

const fix = load<H08Fix>('tests/fixtures/held-out/h08-empty-error.json')
assert.equal(fix.id, 'H08')

const mod = norm('src/shared/ai-empty-error.ts')
for (const name of fix.wiring.moduleExports) {
  assert.ok(mod.includes(`export function ${name}`), `export missing: ${name}`)
}

for (const g of fix.gates) {
  assert.equal(aiEmptyGate(g.hasApiKey), g.expect, `gate ${g.hasApiKey}`)
}
for (const row of fix.errorPrimary) {
  assert.equal(aiErrorPrimaryCta(row.code), row.expect, `cta ${row.code}`)
}
for (const row of fix.modelMissing) {
  assert.equal(aiNeedsModelPick(row.activeModel, row.modelList), row.expect, `model ${JSON.stringify(row)}`)
}
assert.equal(resolveAiModelLabel('', ['a', 'b']), 'a')
assert.equal(resolveAiModelLabel('b', ['a', 'b']), 'b')
assert.equal(resolveAiModelLabel('x', []), '')

for (const status of [0, 401, 404, 429, 503] as const) {
  const zh = friendlyAiHttpError(status, '', 'zh-CN')
  assert.equal(isEngineerLeak(zh), false, zh)
  assert.equal(/^HTTP \d+:/.test(zh), false, zh)
  assert.ok(zh.length > 8, zh)
}

const panel = norm('src/renderer/src/components/AIPanel.tsx')
const card = norm('src/renderer/src/components/AiConfigCard.tsx')
const i18n = norm('src/renderer/src/lib/i18n.tsx')

for (const s of fix.wiring.emptyState) {
  const hay = s.startsWith('ai.') ? i18n + card : panel + card
  assert.ok(hay.includes(s), `H08 empty missing: ${s}`)
}
for (const s of fix.wiring.configuredEmpty) {
  assert.ok(panel.includes(s), `H08 configured empty missing: ${s}`)
}
for (const s of fix.wiring.errorCard) {
  assert.ok(panel.includes(s), `H08 error card missing: ${s}`)
}
for (const s of fix.wiring.modelMissingBanner) {
  assert.ok(panel.includes(s), `H08 model-missing missing: ${s}`)
}

assert.ok(i18n.includes("'ai.modelMissing'"), 'i18n ai.modelMissing')
assert.ok(card.includes("tg('ai.emptyTitle')"), 'AiConfigCard uses emptyTitle')
assert.ok(card.includes("tg('ai.emptyAction')"), 'AiConfigCard uses emptyAction')

console.log(`test-held-out-h08: ok (gates ${fix.gates.length}, errors ${fix.errorPrimary.length})`)
