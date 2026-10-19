/** Polish-33 / M-polish-18: tabs size to content, × right after the title. Package 0.6.56. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const pkg = JSON.parse(norm('package.json')) as { version: string; scripts: Record<string, string> }
assert.ok(pkg.version.localeCompare('0.6.56', undefined, { numeric: true }) >= 0)
assert.match(pkg.scripts['test:parts'], /test-polish-33/)

const css = norm('src/renderer/src/styles.css')
const tab = css.match(/\.tab-bar-scroll > \.tab\s*\{([^}]*)\}/)
assert.ok(tab, 'tab sizing rule')
assert.match(tab![1], /flex:\s*0 0 auto/)
assert.match(tab![1], /min-width:\s*96px/)
assert.match(tab![1], /max-width:\s*220px/)
assert.match(tab![1], /justify-content:\s*flex-start/)
assert.match(css, /\.tab-bar-scroll > \.tab\.active\s*\{[^}]*min-width:\s*96px/)
// Rename input still has room.
assert.match(css, /\.tab-bar-scroll > \.tab:has\(\.tab-rename-input\)\s*\{[^}]*min-width:\s*188px/)
// Title ellipsis survives.
assert.match(css, /\.tab-title\s*\{[^}]*text-overflow:\s*ellipsis/)

const batch = css.slice(css.indexOf('---- M18 (0.6.56)'))
assert.ok(batch.length > 20, 'M18 block')
assert.match(batch, /\.tab > \.tab-title\s*\{\s*flex:\s*0 1 auto/)
assert.match(batch, /\.tab > \.tab-more\s*\{\s*display:\s*none/)
assert.match(batch, /\.tab > \.tab-pin-btn:not\(\.is-on\)\s*\{\s*display:\s*none/)
assert.match(batch, /\.tab > \.tab-close\s*\{\s*margin-left:\s*0/)

// Markup order: title, (pin), (⋯), close. Pin + tab menu stay reachable on right-click.
const app = norm('src/renderer/src/App.tsx')
const iTitle = app.indexOf('<span className="tab-title">{labelFor(t)}</span>')
const iClose = app.indexOf('className="tab-close"', iTitle)
assert.ok(iTitle > 0 && iClose > iTitle)
assert.ok(app.includes('data-testid="tab-pin-btn"') && app.includes('data-testid="tab-row-more"'))
assert.match(norm('src/shared/inline-menus.ts'), /testId: 'tab-pin'/)

const changelog = norm('CHANGELOG.md')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.56'), changelog.indexOf('## v0.6.55'))
assert.ok(note.includes('M-polish-18'))
const entries = changelogFor('0.6.56')
assert.ok(entries.length >= 1 && entries.every((e) => e.text.zh && e.text.en && e.where?.zh && e.where?.en))

console.log('test-polish-33 ok')
