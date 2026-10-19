/** Polish-31 / M-polish-16: fast screenshot iteration, AI empty state, FAB anchor, s4-block overlap. Package 0.6.54. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.ok(pkg.version.localeCompare('0.6.55', undefined, { numeric: true }) >= 0, 'package at or past 0.6.55')
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-31.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const norm = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const shot = norm('scripts/screenshot-key-screens.mjs')
assert.ok(shot.includes("opt('--only')"), '--only filter')
assert.ok(shot.includes("argv.includes('--no-build')"), '--no-build reuse')
assert.ok(shot.includes("npx electron-vite build"), 'builds by default')
assert.ok(shot.includes("opt('--themes')"))
assert.ok(shot.includes('--only matched no shots'), 'typo in --only fails loudly')

const styles = norm('src/renderer/src/styles.css')
const batch = styles.slice(styles.indexOf('---- M16 (0.6.54)'))
assert.ok(batch.length > 0)
const rule = (sel: string) => {
  const i = batch.indexOf('\n' + sel + ' {')
  assert.ok(i >= 0, `missing ${sel}`)
  return batch.slice(i, batch.indexOf('}', i))
}
assert.match(rule('.main'), /position:\s*relative/)
assert.match(norm('src/renderer/src/features.css'), /\.session-command-fab \{\n\s*position: absolute; right: 16px; bottom: 16px;/)
assert.match(rule('.ai-reply-empty p'), /text-wrap:\s*balance/)
assert.match(rule('.ai-reply-empty .ai-starter-prompts'), /flex-direction:\s*column/)
assert.match(rule('.ai-reply-empty .ai-starter-prompts'), /align-items:\s*stretch/)
assert.match(rule('.ai-reply-empty .ai-starter-prompt'), /text-align:\s*left/)
assert.doesNotMatch(batch, /#[0-9a-f]{3,8}\b/i)

const features = norm('src/renderer/src/features.css')
assert.match(features, /\.terminal-stack > \.s4-block \{ position: relative; z-index: 2; height: 28px;/)
assert.match(features, /\.terminal-stack:has\(> \.s4-block\) > \.terminal-layer \{ top: 28px; \}/)
assert.match(features, /\.terminal-stack:has\(> \.term-guard-banner\):has\(> \.s4-block\) > \.terminal-layer \{ top: 52px; \}/)
assert.match(features, /\.terminal-stack:has\(> \.term-guard-banner\) > \.terminal-layer \{ top: 24px; \}/)
const app = norm('src/renderer/src/App.tsx')
const stack = app.slice(app.indexOf('<div className="terminal-stack">'))
assert.ok(stack.indexOf('className="s4-block"') > 0 && stack.indexOf('className="s4-block"') < stack.indexOf('terminal-layer'), 's4-block is an in-flow child of .terminal-stack')
assert.ok(app.includes('data-testid="s4-block"') && app.includes('data-testid="s4-copy"'))

const changelog = norm('CHANGELOG.md')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.54'), changelog.indexOf('## v0.6.53'))
assert.ok(note.includes('M-polish-16'))
const entries = changelogFor('0.6.54')
assert.ok(entries.length >= 1 && entries.every((e) => e.text.zh && e.text.en && e.where?.zh && e.where?.en))

console.log('test-polish-31 ok')