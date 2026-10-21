import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * F (round 49): default style guards, whole renderer.
 * 1. CJK text (incl. full-width punctuation) in .tsx outside i18n -> must go through i18n.
 * 2. px in padding / margin / gap / font-size across features.css + styles.css -> use --space-* / --fs-*.
 * Both are ratchets: counts may only go down (scripts/style-baseline.json). UPDATE_STYLE_BASELINE=1 lowers it.
 */
const root = process.cwd()
const walk = (d: string): string[] =>
  readdirSync(d).flatMap((n) => {
    const p = join(d, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })

const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
}
const cjkHits: string[] = []
for (const f of walk(join(root, 'src/renderer/src'))) {
  if (!f.endsWith('.tsx') || /[\\/]lib[\\/]i18n\.tsx$/.test(f)) continue
  stripComments(readFileSync(f, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      if (CJK.test(line)) cjkHits.push(`${relative(root, f)}:${i + 1}: ${line.trim().slice(0, 80)}`)
    })
}

const PX = /(?:^|[;{\s])(padding|margin|gap|font-size)(?:-[a-z]+)?\s*:[^;}]*\b(?!0px)\d+(?:\.\d+)?px/g
let pxCount = 0
const pxByFile: Record<string, number> = {}
for (const f of ['src/renderer/src/features.css', 'src/renderer/src/styles.css']) {
  const css = readFileSync(join(root, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const n = [...css.matchAll(PX)].length
  pxByFile[f] = n
  pxCount += n
}

const basePath = join(root, 'scripts/style-baseline.json')
const base = JSON.parse(readFileSync(basePath, 'utf8')) as { jsxCjk: number; cssPx: number }
if (process.env.UPDATE_STYLE_BASELINE === '1') {
  writeFileSync(basePath, JSON.stringify({ ...base, jsxCjk: Math.min(base.jsxCjk, cjkHits.length), cssPx: Math.min(base.cssPx, pxCount) }, null, 2) + '\n')
}
assert.ok(cjkHits.length <= base.jsxCjk, `JSX CJK rose to ${cjkHits.length} (baseline ${base.jsxCjk}); move text to i18n:\n${cjkHits.join('\n')}`)
assert.ok(pxCount <= base.cssPx, `CSS px spacing rose to ${pxCount} (baseline ${base.cssPx}) ${JSON.stringify(pxByFile)}; use --space-* / --fs-*`)

// self-test of the matchers
assert.ok(CJK.test('：') && CJK.test('中') && !CJK.test('abc'))
assert.equal([...'a{padding: 8px}'.matchAll(PX)].length, 1)
assert.equal([...'a{padding: var(--space-2)}'.matchAll(PX)].length, 0)
assert.equal([...'a{border: 1px solid}'.matchAll(PX)].length, 0)
console.log(`test-style-guards ok: jsxCjk=${cjkHits.length}/${base.jsxCjk} cssPx=${pxCount}/${base.cssPx}`)
