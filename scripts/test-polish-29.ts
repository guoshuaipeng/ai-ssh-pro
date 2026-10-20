/** Polish-29 / M-polish-14: evidence-based polish from the dark/light key-screen pass. Package 0.6.52. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  version: string
  build?: { win?: Record<string, unknown> }
  scripts: { test: string; 'test:parts'?: string }
}
assert.equal(pkg.version, '0.6.63')
assert.equal(Object.hasOwn(pkg.build?.win ?? {}, 'fileVersion'), false)
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-29.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const features = readFileSync('src/renderer/src/features.css', 'utf8').replace(/\r\n/g, '\n')
const batch = features.slice(features.indexOf('M-polish-14 (0.6.52)'))
assert.ok(batch.length > 0)
const rule = (sel: string) => {
  const i = batch.indexOf(sel + ' {')
  assert.ok(i >= 0, `missing ${sel}`)
  return batch.slice(i, batch.indexOf('}', i))
}
// G1 settings nav: flat list rows
assert.match(rule('.settings-nav button'), /border:\s*0/)
assert.match(rule('.settings-nav button'), /background:\s*transparent/)
assert.match(rule('.settings-nav button'), /justify-content:\s*flex-start/)
assert.match(rule('.settings-nav button.is-on'), /var\(--color-row-selected-bg\)/)
assert.match(rule('.settings-nav button.is-on'), /inset 2px 0 0 var\(--color-accent\)/)
// G2 fieldset hairline
assert.match(rule('fieldset'), /border:\s*1px solid var\(--color-border-muted\)/)
assert.match(rule('legend'), /color:\s*var\(--color-text-secondary\)/)
// G3 no card-in-card in dialogs
assert.match(rule('.modal-panel .modal-body .empty-state'), /box-shadow:\s*none/)
// G4 palette: single hairline, no stacked global focus ring
assert.match(rule('.cmdp-input:focus-visible'), /outline:\s*none/)
assert.match(rule('.cmdp-input:focus-visible'), /border-bottom-color:\s*var\(--color-accent\)/)
const palette = readFileSync('src/renderer/src/components/CommandPalette.tsx', 'utf8')
assert.ok(palette.includes("const grouped = laid.rows.some((r) => r.kind === 'header')"))
assert.ok(palette.includes('e.note || !grouped'))
// G5 ops home head → M17: the status line moved under the page title (wraps, never hidden).
assert.match(rule('.oh-status'), /flex-wrap:\s*wrap/)
assert.equal(batch.includes('.l7b-head-status'), false)
assert.doesNotMatch(batch, /#[0-9a-fA-F]{3,8}\b/, 'tokens only')
assert.doesNotMatch(batch, /(padding|gap|font-size)[^;]*\b(4|8|12|16|24|32)px/, 'spacing on tokens')

// Visual QA harness: opt-in hook + key-screen script
const hooks = readFileSync('src/renderer/src/lib/screenshot-hooks.ts', 'utf8')
assert.ok(hooks.includes('op: "menu"; action: string'))
assert.ok(hooks.includes('localStorage') || hooks.includes('getItem'), 'hooks stay opt-in')
assert.ok(existsSync('scripts/screenshot-key-screens.mjs'))
const shot = readFileSync('scripts/screenshot-key-screens.mjs', 'utf8')
assert.ok(shot.includes("insertCSS('.toast-stack"), 'toasts hidden via CSS, not by removing React nodes')
assert.ok(shot.includes("theme: 'light'") && shot.includes("theme: 'github-dark'"))

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.52'), changelog.indexOf('## v0.6.51'))
assert.ok(note.includes('M-polish-14'))
assert.ok(changelogFor('0.6.52').length >= 1)

console.log('test-polish-29 ok')