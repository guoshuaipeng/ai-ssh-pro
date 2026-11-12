# -*- coding: utf-8 -*-
"""R34 item2: quieter failure-pin + memory same-screen hierarchy."""
from pathlib import Path

root = Path('.')
css = Path('src/renderer/src/styles.css')
ct = css.read_text(encoding='utf-8')
marker = '/* R34 Round34: quieter failure+memory hierarchy'
if marker not in ct:
    # Append after R26 hierarchy block (before R25 working-memory expand)
    r25 = '/* R25 Round25: working-memory expand UX */'
    if r25 not in ct:
        raise SystemExit('R25 marker missing')
    block = '''/* R34 Round34: quieter failure+memory hierarchy */
/* Failure evidence owns the story; memory stays count-only chrome even on wide. */
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip {
  opacity: 0.58;
  color: var(--color-text-muted);
}
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip-label,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip-label {
  display: none;
}
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-wrap,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-wrap {
  max-width: 3.75rem;
  flex: 0 0 auto;
}
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip:hover,
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip.is-open,
.ai-panel:has([data-testid='ai-failure-evidence']) .ai-memory-chip:focus-visible,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip:hover,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip.is-open,
.ai-panel:has(.ai-exec-replay.has-failure-pin) .ai-memory-chip:focus-visible {
  opacity: 0.92;
  color: var(--color-text-muted);
  background: var(--color-fill-muted);
}

'''
    ct = ct.replace(r25, block + r25, 1)
    css.write_text(ct, encoding='utf-8')
    print('CSS item2 added')
else:
    print('CSS item2 already present')

# Extend r34 matrix with failure+memory shots (append names + shots)
matrix = Path('scripts/ai-shot-matrix-r34.mjs')
mt = matrix.read_text(encoding='utf-8')
if 'r34-failure-memory' not in mt:
    mt = mt.replace(
        "  'r34-en-ask-pop'\n]",
        "  'r34-en-ask-pop',\n  'r34-failure-memory',\n  'r34-failure-memory-narrow'\n]",
        1,
    )
    # insert shots before closing of return [
    insert_shots = '''    {
      name: 'r34-failure-memory',
      wait: 1600,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiChat', empty: true },
        { op: 'aiFailureEvidence', withMemory: true }
      ],
      expect:
        "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-memory-chip]')&&parseFloat(getComputedStyle(document.querySelector('[data-testid=ai-memory-chip]')).opacity)<0.7&&getComputedStyle(document.querySelector('.ai-memory-chip-label')||document.createElement('span')).display==='none')"
    },
    {
      name: 'r34-failure-memory-narrow',
      narrow: true,
      wait: 1700,
      steps: [
        { op: 'menu', action: 'demoHost' },
        { op: 'aiChat', empty: true },
        { op: 'aiFailureEvidence', withMemory: true }
      ],
      expect:
        "!!(document.querySelector('[data-testid=ai-failure-evidence]')&&document.querySelector('[data-testid=ai-memory-chip]')&&parseFloat(getComputedStyle(document.querySelector('[data-testid=ai-memory-chip]')).opacity)<0.7)"
    }
'''
    # before final `  ]\n}` of export function
    anchor = "      expect: expectPop('Ask')\n    }\n  ]\n}"
    if anchor not in mt:
        raise SystemExit('matrix anchor missing')
    mt = mt.replace(anchor, "      expect: expectPop('Ask')\n    },\n" + insert_shots + "  ]\n}", 1)
    matrix.write_text(mt, encoding='utf-8')
    print('matrix extended')
else:
    print('matrix already has failure-memory')

# test for item2
Path('scripts/test-r34-failure-memory-hierarchy.ts').write_text('''/** R34 polish: failure pin + memory same-screen hierarchy quieter. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { r34AiShots, R34_AI_SHOT_NAMES } from './ai-shot-matrix-r34.mjs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\\r\\n/g, '\\n')

assert.ok(R34_AI_SHOT_NAMES.includes('r34-failure-memory'))
assert.ok(R34_AI_SHOT_NAMES.includes('r34-failure-memory-narrow'))
assert.equal(R34_AI_SHOT_NAMES.length, 12)

const shots = r34AiShots()
const fail = shots.find((s) => s.name === 'r34-failure-memory')
const failN = shots.find((s) => s.name === 'r34-failure-memory-narrow')
assert.ok(fail?.steps?.some((st) => st.op === 'aiFailureEvidence' && (st as { withMemory?: boolean }).withMemory === true))
assert.ok(fail?.expect?.includes('opacity'))
assert.ok(fail?.expect?.includes('0.7'))
assert.equal(failN?.narrow, true)

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R34 Round34: quieter failure+memory hierarchy'))
const start = css.indexOf('R34 Round34: quieter failure+memory hierarchy')
const end = css.indexOf('R25 Round25: working-memory expand UX', start)
assert.ok(start >= 0 && end > start)
const block = css.slice(start, end)
assert.ok(block.includes('opacity: 0.58'))
assert.ok(block.includes("display: none"))
assert.ok(block.includes('max-width: 3.75rem'))
assert.equal(/var\\(--[^,)]+,\\s*[^)]+\\)/.test(block), false, 'no token fallbacks')

// R26 baseline still present; R34 wins on specificity+order for opacity
assert.ok(css.includes('R26 Round26: failure pin + memory chip hierarchy'))

const pkg = norm('package.json')
assert.ok(pkg.includes('test-r34-failure-memory-hierarchy'))

console.log('test-r34-failure-memory-hierarchy: ok')
''', encoding='utf-8')
print('test2 written')

# wire package.json after item1 test
pkg = Path('package.json')
pt = pkg.read_text(encoding='utf-8')
needle = 'scripts/test-r34-zh-en-policy-chip-contrast.ts"'
repl = 'scripts/test-r34-zh-en-policy-chip-contrast.ts && npx tsx --tsconfig tsconfig.node.json scripts/test-r34-failure-memory-hierarchy.ts"'
if 'test-r34-failure-memory-hierarchy' not in pt:
    if needle not in pt:
        # maybe without quote end
        needle2 = 'scripts/test-r34-zh-en-policy-chip-contrast.ts'
        if needle2 not in pt:
            raise SystemExit('pkg item1 needle missing')
        pt = pt.replace(needle2, needle2 + ' && npx tsx --tsconfig tsconfig.node.json scripts/test-r34-failure-memory-hierarchy.ts', 1)
    else:
        pt = pt.replace(needle, repl, 1)
    pkg.write_text(pt, encoding='utf-8')
    print('pkg wired item2')
else:
    print('pkg already has item2')

# update README
readme = Path('docs/screenshots/r34/README.md')
rt = readme.read_text(encoding='utf-8')
if 'r34-failure-memory' not in rt:
    rt = rt.rstrip() + '''

| `*-r34-failure-memory.png` | zh-CN | — | failure pin + memory quieter (opacity &lt; 0.7, label hidden) |
| `*-r34-failure-memory-narrow.png` | zh-CN | — | same, narrow |

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r34 --set chrome --only r34-failure-memory,r34-failure-memory-narrow --themes dark,light
```
'''
    readme.write_text(rt + '\n', encoding='utf-8')
    print('README updated')

print('ITEM2 PATCH DONE')