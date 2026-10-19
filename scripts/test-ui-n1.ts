/** UI-N1: short aliases resolve through ui-tokens, and shell CSS has no hex false fallbacks. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')

const aliases: Array<[string, string]> = [
  ['--surface-1', '--color-bg-surface'],
  ['--surface-2', '--color-bg-elevated'],
  ['--fg', '--color-text-primary'],
  ['--ok', '--color-ok'],
  ['--warn', '--color-warn'],
  ['--accent', '--color-accent'],
  ['--border', '--color-border-default'],
  ['--danger', '--color-danger'],
  ['--panel-2', '--color-bg-code']
]
for (const [alias, source] of aliases) {
  assert.match(styles, new RegExp(`${alias}:\\s*var\\(${source}\\)`), `${alias} → ${source}`)
}

assert.equal(styles.includes('--surface-1: var(--bg-panel)'), false)
assert.equal(styles.includes('--color-accent: var(--accent)'), false)
assert.equal(styles.includes('--color-border-default: var(--border)'), false)
assert.equal(styles.includes('--color-ok: var(--ok)'), false)
assert.equal(/--accent:\s*#/.test(styles), false)
assert.equal(/--border:\s*#/.test(styles), false)
assert.equal(/--ok:\s*#/.test(styles), false)
assert.match(styles, /--color-ok:\s*#3fb950/)
assert.match(styles, /--color-accent:\s*#58a6ff/)

const shell = styles + '\n' + features + '\n' + readFileSync('src/renderer/src/styles-m2.css', 'utf8')
assert.equal(shell.match(/var\(\s*--[a-z0-9-]+\s*,\s*#/gi), null)

const tailwind = /#(?:3b82f6|22c55e|f59e0b|161a20|1d222a|2a3039|ef4444|e11d48|0f1115|eab308|f97316|6b7280|9ca3af|374151|1e3a8a)\b|rgba\(\s*(?:59,\s*130,\s*246|34,\s*197,\s*94|239,\s*68,\s*68|249,\s*115,\s*22|234,\s*179,\s*8)\b/i
assert.equal(tailwind.test(features), false, 'features.css still has a Tailwind stand-in')

for (const sel of ['.inv20-card', '.ctx-menu', '.o1-card', '.alert-line', '.tab.tab-guard-prod', '.l7-card']) {
  assert.match(features, new RegExp(`${sel.replace(/\./g, '\\.')}[^{]*\\{[^}]*var\\(--color-`))
}

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { 'check:tokens': string } }
assert.equal(pkg.version, '0.6.53')
assert.match(pkg.scripts['check:tokens'], /check-token-fallbacks/)

const gate = spawnSync(process.execPath, ['scripts/check-token-fallbacks.mjs'], { encoding: 'utf8' })
assert.equal(gate.status, 0, gate.stderr || gate.stdout)

console.log('test-ui-n1 ok')
