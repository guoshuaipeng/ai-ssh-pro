import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readonlyHostHint } from '../src/shared/readonly-host-hint'
import { prodAutoHint } from '../src/shared/prod-auto-hint'
import { resolveAiPolicy } from '../src/shared/ai-policy'
import { aiWriteVerdict, aiEffectiveLevel } from '../src/shared/ai-write-guard'

const pol = (o: Parameters<typeof resolveAiPolicy>[0]) => resolveAiPolicy(o)

// readonly → calm hint; caps ask/auto to suggest
const roAsk = pol({ settings: { aiPolicy: 'ask' }, protection: { level: 'readonly' } })
assert.deepEqual(readonlyHostHint({ level: 'readonly', policy: roAsk }), {
  source: 'global',
  chosen: 'ask',
  effective: 'suggest',
  capped: true
})
const roAuto = pol({ settings: { aiPolicy: 'auto' }, hostPolicy: 'auto', protection: { level: 'readonly' } })
assert.equal(readonlyHostHint({ level: 'readonly', policy: roAuto })?.effective, 'suggest')
assert.equal(readonlyHostHint({ level: 'readonly', policy: roAuto })?.capped, true)
assert.equal(readonlyHostHint({ level: 'readonly', policy: roAuto })?.source, 'host')

// already suggest → still show (visibility), capped true via effective
const roSug = pol({ settings: { aiPolicy: 'suggest' }, protection: { level: 'readonly' } })
assert.equal(readonlyHostHint({ level: 'readonly', policy: roSug })?.effective, 'suggest')
assert.equal(readonlyHostHint({ level: 'readonly', policy: roSug })?.capped, true)

// not readonly → null
assert.equal(readonlyHostHint({ level: 'normal', policy: roAsk }), null)
assert.equal(readonlyHostHint({ level: 'production', policy: pol({ settings: { aiPolicy: 'auto' }, protection: { level: 'production' } }) }), null)

// mutual exclusion with prod-auto
assert.equal(prodAutoHint({ level: 'readonly', paused: false, policy: roAuto }), null)

// cheap smoke: AI never writes on readonly (even elevated / approved)
assert.equal(aiEffectiveLevel({ level: 'readonly', elevated: true }), 'readonly')
assert.deepEqual(aiWriteVerdict({ level: 'readonly', elevated: false }, { approved: true, kind: 'write' }), {
  allow: false,
  reason: 'readonly'
})
assert.deepEqual(aiWriteVerdict({ level: 'readonly', elevated: true }, { approved: true, kind: 'high' }), {
  allow: false,
  reason: 'readonly'
})

// wiring
const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8')
assert.ok(panel.includes("from '@shared/readonly-host-hint'"))
assert.ok(panel.includes('readonlyHostHint({'))
assert.ok(panel.includes('data-testid="ai-readonly-banner"'))
assert.ok(panel.includes("tg('roHost.chip')"))
assert.ok(panel.includes("tg('roHost.panelHint')"))
assert.ok(panel.includes("tg('roHost.tip'"))
assert.ok(panel.includes("detail?.op === 'aiReadonlyBanner'"))
assert.ok(panel.includes("setScreenshotProtectionOverride('readonly')"))
assert.ok(panel.includes('panelReadonly && !panelProdAuto'), 'no double host-safety strip')

const css = readFileSync('src/renderer/src/styles.css', 'utf8')
assert.ok(css.includes('.ai-readonly-banner'))
assert.ok(css.includes('.ai-readonly-dot'))
assert.ok(css.includes('var(--color-ok)'))

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
for (const k of ['roHost.chip', 'roHost.panelHint', 'roHost.tip']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, k)
}
assert.ok(i18n.includes('只读主机 · AI 不会写入'))
assert.ok(i18n.includes('AI will not write'))
assert.ok(i18n.includes('临时解锁只影响人工终端输入'))

const hooks = readFileSync('src/renderer/src/lib/screenshot-hooks.ts', 'utf8')
assert.ok(hooks.includes('aiReadonlyBanner'))

console.log('test-readonly-host-hint: ok')
