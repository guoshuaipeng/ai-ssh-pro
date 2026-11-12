# -*- coding: utf-8 -*-
"""R34 item1: ZH/EN policy chip contrast — op + CSS + matrix + tests + wire."""
from pathlib import Path
import re

root = Path('.')

# --- 1) screenshot-hooks.ts: add aiPolicy op ---
hooks = Path('src/renderer/src/lib/screenshot-hooks.ts')
ht = hooks.read_text(encoding='utf-8')
if 'op: "aiPolicy"' not in ht and "op: 'aiPolicy'" not in ht:
    needle = '  /** Round 33: force UI locale for EN chip matrix. */\n  | { op: "locale"; id: "en" | "zh-CN" }'
    insert = needle + '\n  /** Round 34: force tab temp AI policy for ZH/EN chip contrast matrix. */\n  | { op: "aiPolicy"; id: "ask" | "suggest" | "auto" }'
    if needle not in ht:
        raise SystemExit('hooks locale needle missing')
    ht = ht.replace(needle, insert, 1)
    hooks.write_text(ht, encoding='utf-8')
    print('hooks: aiPolicy op added')
else:
    print('hooks: aiPolicy already present')

# --- 2) App.tsx: handle aiPolicy ---
app = Path('src/renderer/src/App.tsx')
at = app.read_text(encoding='utf-8')
if "detail.op === 'aiPolicy'" not in at:
    locale_block = """      if (detail.op === 'locale') {
        const id = (detail as { id?: string }).id === 'en' ? 'en' : 'zh-CN'
        setLocale(id)
        return
      }"""
    ai_policy_block = """      if (detail.op === 'locale') {
        const id = (detail as { id?: string }).id === 'en' ? 'en' : 'zh-CN'
        setLocale(id)
        return
      }
      if (detail.op === 'aiPolicy') {
        // Round 34: ZH/EN policy chip contrast matrix — temp override for this tab.
        const raw = (detail as { id?: string }).id
        const policy = raw === 'suggest' || raw === 'auto' || raw === 'ask' ? raw : 'ask'
        setQuickOpen(false)
        setTourOpen(false)
        ensureAiVisible()
        openRightPanelRef.current('ai')
        const tabId = activeTabIdRef.current
        if (tabId) {
          setTempPolicyByTab((prev) => ({ ...prev, [tabId]: policy }))
        }
        return
      }"""
    if locale_block not in at:
        raise SystemExit('App locale block missing')
    at = at.replace(locale_block, ai_policy_block, 1)
    app.write_text(at, encoding='utf-8')
    print('App: aiPolicy handler added')
else:
    print('App: aiPolicy already present')

# --- 3) CSS after R19 block ---
css = Path('src/renderer/src/styles.css')
ct = css.read_text(encoding='utf-8')
marker = '/* R34 Round34: ZH/EN policy chip contrast'
if marker not in ct:
    # Insert after R19 block ends (before H02 suggest-only)
    h02 = '/* H02: suggest-only decision row — copy is the primary action, never Agree. */'
    if h02 not in ct:
        raise SystemExit('H02 marker missing')
    block = '''/* R34 Round34: ZH/EN policy chip contrast — band tint + room for Suggest/仅建议 */
/* Ask/Suggest/Auto vs 需确认/仅建议/自动 stay distinct on dark+light without CTA-like Confirm. */
.ai-composer-bar .ai-safety-chip.safety-band-ok {
  color: var(--color-ok);
  background: color-mix(in srgb, var(--color-ok) 14%, transparent);
}
.ai-composer-bar .ai-safety-chip.safety-band-warn {
  color: var(--color-warn);
  background: color-mix(in srgb, var(--color-warn) 14%, transparent);
}
.ai-composer-bar .ai-safety-chip.safety-band-danger {
  color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 16%, transparent);
}
.ai-composer-bar .ai-safety-chip.is-open.safety-band-ok,
.ai-composer-bar .ai-safety-chip.is-open.safety-band-warn,
.ai-composer-bar .ai-safety-chip.is-open.safety-band-danger {
  background: color-mix(in srgb, var(--color-text-primary) 10%, transparent);
}
.ai-composer-bar .ai-safety-chip .ai-safety-chip-label {
  max-width: 5.75em;
  letter-spacing: 0.01em;
}
@container (max-width: 230px) {
  .ai-composer-bar .ai-safety-chip .ai-safety-chip-label {
    max-width: 4.5em;
  }
}

'''
    ct = ct.replace(h02, block + h02, 1)
    css.write_text(ct, encoding='utf-8')
    print('CSS: R34 contrast block added')
else:
    print('CSS: R34 already present')

# --- 4) shot matrix ---
matrix = Path('scripts/ai-shot-matrix-r34.mjs')
matrix.write_text('''/** Round 34: ZH/EN policy chip contrast — Ask/Suggest/Auto vs 需确认/仅建议/自动. */
export const R34_AI_SHOT_NAMES = [
  'r34-zh-ask',
  'r34-zh-suggest',
  'r34-zh-auto',
  'r34-en-ask',
  'r34-en-suggest',
  'r34-en-auto',
  'r34-zh-ask-narrow',
  'r34-en-suggest-narrow',
  'r34-zh-ask-pop',
  'r34-en-ask-pop'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r34AiShots() {
  const open = (locale, policy) => [
    { op: 'locale', id: locale },
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true },
    { op: 'aiPolicy', id: policy }
  ]
  const expectChip = (label) =>
    `!!(document.querySelector('[data-testid=ai-safety-chip-label]')&&(document.querySelector('[data-testid=ai-safety-chip-label]').textContent||'').trim()===${JSON.stringify(label)}&&document.querySelector('[data-testid=ai-safety-chip]')&&['ask','suggest','auto'].includes(document.querySelector('[data-testid=ai-safety-chip]').getAttribute('data-policy')||''))`
  const expectPop = (label) =>
    `!!(document.querySelector('[data-testid=ai-safety-chip-label]')&&(document.querySelector('[data-testid=ai-safety-chip-label]').textContent||'').trim()===${JSON.stringify(label)}&&document.querySelector('[data-testid=ai-safety-pop]'))`
  return [
    { name: 'r34-zh-ask', wait: 1500, steps: open('zh-CN', 'ask'), expect: expectChip('需确认') },
    { name: 'r34-zh-suggest', wait: 1500, steps: open('zh-CN', 'suggest'), expect: expectChip('仅建议') },
    { name: 'r34-zh-auto', wait: 1500, steps: open('zh-CN', 'auto'), expect: expectChip('自动') },
    { name: 'r34-en-ask', wait: 1500, steps: open('en', 'ask'), expect: expectChip('Ask') },
    { name: 'r34-en-suggest', wait: 1500, steps: open('en', 'suggest'), expect: expectChip('Suggest') },
    { name: 'r34-en-auto', wait: 1500, steps: open('en', 'auto'), expect: expectChip('Auto') },
    { name: 'r34-zh-ask-narrow', narrow: true, wait: 1600, steps: open('zh-CN', 'ask'), expect: expectChip('需确认') },
    { name: 'r34-en-suggest-narrow', narrow: true, wait: 1600, steps: open('en', 'suggest'), expect: expectChip('Suggest') },
    {
      name: 'r34-zh-ask-pop',
      wait: 1600,
      steps: [...open('zh-CN', 'ask'), { op: 'aiComposerPop', which: 'safety' }],
      expect: expectPop('需确认')
    },
    {
      name: 'r34-en-ask-pop',
      wait: 1600,
      steps: [...open('en', 'ask'), { op: 'aiComposerPop', which: 'safety' }],
      expect: expectPop('Ask')
    }
  ]
}
''', encoding='utf-8')
print('matrix written')

# --- 5) wire harness ---
har = Path('scripts/screenshot-key-screens.mjs')
ht = har.read_text(encoding='utf-8')
if "ai-shot-matrix-r34" not in ht:
    ht = ht.replace(
        "import { r33AiShots } from './ai-shot-matrix-r33.mjs'",
        "import { r33AiShots } from './ai-shot-matrix-r33.mjs'\nimport { r34AiShots } from './ai-shot-matrix-r34.mjs'",
        1,
    )
    # insert after r33 spread
    r33_spread = """  ...${JSON.stringify(r33AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    toasts: !!s.toasts,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    r34_spread = """  ...${JSON.stringify(r33AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    toasts: !!s.toasts,
    steps: s.steps,
    expect: s.expect || undefined
  })),
  // Round 34: ZH/EN policy chip contrast (Ask/Suggest/Auto vs 需确认/仅建议/自动)
  ...${JSON.stringify(r34AiShots())}.map((s) => ({
    name: s.name,
    size: s.narrow ? N : W,
    wait: s.wait || 1000,
    steps: s.steps,
    expect: s.expect || undefined
  }))
]"""
    if r33_spread not in ht:
        raise SystemExit('r33 spread not found')
    ht = ht.replace(r33_spread, r34_spread, 1)
    har.write_text(ht, encoding='utf-8')
    print('harness wired')
else:
    print('harness already has r34')

# --- 6) test ---
Path('scripts/test-r34-zh-en-policy-chip-contrast.ts').write_text('''/** R34: ZH/EN policy chip contrast — shorts, band tint CSS, shot matrix, aiPolicy op. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'
import { r34AiShots, R34_AI_SHOT_NAMES } from './ai-shot-matrix-r34.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

assert.deepEqual(
  R34_AI_SHOT_NAMES,
  [
    'r34-zh-ask',
    'r34-zh-suggest',
    'r34-zh-auto',
    'r34-en-ask',
    'r34-en-suggest',
    'r34-en-auto',
    'r34-zh-ask-narrow',
    'r34-en-suggest-narrow',
    'r34-zh-ask-pop',
    'r34-en-ask-pop'
  ]
)
assert.equal(R34_AI_SHOT_NAMES.length, 10)

assert.equal(translate('zh-CN', 'policy.chip.ask'), '需确认')
assert.equal(translate('zh-CN', 'policy.chip.suggest'), '仅建议')
assert.equal(translate('zh-CN', 'policy.chip.auto'), '自动')
assert.equal(translate('en', 'policy.chip.ask'), 'Ask')
assert.equal(translate('en', 'policy.chip.suggest'), 'Suggest')
assert.equal(translate('en', 'policy.chip.auto'), 'Auto')
assert.notEqual(translate('en', 'policy.chip.ask'), 'Confirm')
assert.notEqual(translate('en', 'policy.chip.ask'), translate('en', 'policy.ask'))

const shots = r34AiShots()
assert.equal(shots.length, 10)
const by = Object.fromEntries(shots.map((s) => [s.name, s]))
assert.ok(by['r34-zh-ask']?.steps?.some((st) => st.op === 'locale' && (st as { id?: string }).id === 'zh-CN'))
assert.ok(by['r34-zh-ask']?.steps?.some((st) => st.op === 'aiPolicy' && (st as { id?: string }).id === 'ask'))
assert.ok(by['r34-en-suggest']?.steps?.some((st) => st.op === 'aiPolicy' && (st as { id?: string }).id === 'suggest'))
assert.ok(by['r34-en-auto']?.steps?.some((st) => st.op === 'locale' && (st as { id?: string }).id === 'en'))
assert.ok(by['r34-zh-ask']?.expect?.includes('需确认'))
assert.ok(by['r34-en-ask']?.expect?.includes("'Ask'") || by['r34-en-ask']?.expect?.includes('"Ask"'))
assert.ok(by['r34-en-suggest']?.expect?.includes('Suggest'))
assert.ok(by['r34-zh-suggest']?.expect?.includes('仅建议'))
assert.equal(by['r34-zh-ask-narrow']?.narrow, true)
assert.equal(by['r34-en-suggest-narrow']?.narrow, true)
assert.ok(by['r34-zh-ask-pop']?.steps?.some((st) => st.op === 'aiComposerPop'))
assert.ok(by['r34-en-ask-pop']?.expect?.includes('ai-safety-pop') || by['r34-en-ask-pop']?.expect?.includes('Ask'))

const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('aiPolicy'))
assert.ok(hooks.includes('"ask" | "suggest" | "auto"') || hooks.includes("'ask' | 'suggest' | 'auto'"))

const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("detail.op === 'aiPolicy'"))
assert.ok(app.includes('setTempPolicyByTab'))
assert.ok(app.includes("raw === 'suggest' || raw === 'auto' || raw === 'ask'"))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R34 Round34: ZH/EN policy chip contrast'))
const start = css.indexOf('R34 Round34: ZH/EN policy chip contrast')
const end = css.indexOf('H02: suggest-only decision row', start)
assert.ok(start >= 0 && end > start)
const block = css.slice(start, end)
assert.ok(block.includes('safety-band-ok'))
assert.ok(block.includes('safety-band-warn'))
assert.ok(block.includes('safety-band-danger'))
assert.ok(block.includes('color-mix'))
assert.ok(block.includes('max-width: 5.75em'))
assert.ok(block.includes('max-width: 4.5em'))
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(block), false, 'no token fallbacks in R34 CSS')

const har = norm('scripts/screenshot-key-screens.mjs')
assert.ok(har.includes("from './ai-shot-matrix-r34.mjs'"))
assert.ok(har.includes('r34AiShots()'))

const pkg = norm('package.json')
assert.ok(pkg.includes('test-r34-zh-en-policy-chip-contrast'))

console.log('test-r34-zh-en-policy-chip-contrast: ok', R34_AI_SHOT_NAMES.length)
''', encoding='utf-8')
print('test written')

# --- 7) package.json wire ---
pkg = Path('package.json')
pt = pkg.read_text(encoding='utf-8')
needle = 'scripts/test-r33-miss-en-chip-shots.ts"'
repl = 'scripts/test-r33-miss-en-chip-shots.ts && npx tsx --tsconfig tsconfig.node.json scripts/test-r34-zh-en-policy-chip-contrast.ts"'
if 'test-r34-zh-en-policy-chip-contrast' not in pt:
    if needle not in pt:
        raise SystemExit('package.json r33 needle missing')
    pt = pt.replace(needle, repl, 1)
    pkg.write_text(pt, encoding='utf-8')
    print('package.json wired')
else:
    print('package.json already has r34 item1')

# --- 8) README ---
Path('docs/screenshots/r34').mkdir(parents=True, exist_ok=True)
Path('docs/screenshots/r34/README.md').write_text('''# Round 34 screenshots — ZH/EN policy chip contrast

Ask / Suggest / Auto vs 需确认 / 仅建议 / 自动. Band-tinted chip (ok/warn/danger) + room for Suggest/仅建议.

| File | Locale | Policy | Notes |
|------|--------|--------|-------|
| `*-r34-zh-ask.png` | zh-CN | ask | chip **需确认** |
| `*-r34-zh-suggest.png` | zh-CN | suggest | **仅建议** |
| `*-r34-zh-auto.png` | zh-CN | auto | **自动** |
| `*-r34-en-ask.png` | en | ask | **Ask** (not Confirm) |
| `*-r34-en-suggest.png` | en | suggest | **Suggest** |
| `*-r34-en-auto.png` | en | auto | **Auto** |
| `*-r34-zh-ask-narrow.png` | zh-CN | ask | narrow |
| `*-r34-en-suggest-narrow.png` | en | suggest | longest EN short |
| `*-r34-zh-ask-pop.png` | zh-CN | ask | chip + menu full names |
| `*-r34-en-ask-pop.png` | en | ask | chip Ask + Confirm before run in menu |

Ops: `locale`, `aiPolicy`, `aiComposerPop`.

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r34 --set chrome --only r34-zh-ask,r34-zh-suggest,r34-zh-auto,r34-en-ask,r34-en-suggest,r34-en-auto,r34-zh-ask-narrow,r34-en-suggest-narrow,r34-zh-ask-pop,r34-en-ask-pop --themes dark,light
```
''', encoding='utf-8')
print('README written')

# design note
Path('docs/design').mkdir(parents=True, exist_ok=True)
Path('docs/design/r34-zh-en-policy-chip-contrast.md').write_text('''# R34 design — ZH/EN policy chip contrast

## Goal
Composer policy chip shorts stay clear in both locales on dark+light, wide+narrow:
- ZH: 需确认 / 仅建议 / 自动
- EN: Ask / Suggest / Auto (never Confirm — Agree CTA)

## UX
- One primary story: chip band tone (ok/warn/danger) + short label.
- Menu keeps full names (执行前确认 / Confirm before run).
- aria/title still use full effective + source.

## Change
- Screenshot op `aiPolicy` sets tab temp policy.
- CSS: band tint via color-mix; label max-width 5.75em / narrow 4.5em so Suggest/仅建议 rarely clip to mystery glyphs.
- Matrix: 10 states × dark/light.

## Must-verify
- EN Ask ≠ Confirm; ZH 需确认 visible on warn tint.
- Narrow Suggest still readable or calm ellipsis with title.
- Pop: chip short + menu full labels both visible.
''', encoding='utf-8')
print('design note written')
print('ITEM1 PATCH DONE')