/** UI-N5: window chrome density — titlebar hit targets, quiet resizer, menu hover tokens. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const styles = readFileSync('src/renderer/src/styles.css', 'utf8').replace(/\r\n/g, '\n')
const features = readFileSync('src/renderer/src/features.css', 'utf8').replace(/\r\n/g, '\n')
const css = `${styles}\n${features}`

function ruleBody(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(?:^|[}\\n])\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm')
  const m = source.match(re)
  assert.ok(m, `missing rule ${selector}`)
  return m[1]!
}

const titlebarControls = ['.titlebar-menu-trigger', '.titlebar-btn', '.titlebar-icon-btn', '.app-toolbar-version']
for (const sel of titlebarControls) {
  const body = ruleBody(styles, sel)
  assert.match(body, /min-height:\s*32px/, `${sel} min-height`)
  assert.match(body, /(?:^|\n)\s*height:\s*32px/, `${sel} height`)
  assert.match(body, /min-width:\s*32px/, `${sel} min-width`)
  assert.match(body, /border-radius:\s*var\(--radius-md\)/, `${sel} radius`)
  assert.doesNotMatch(body, /height:\s*26px|border-radius:\s*4px|border-radius:\s*var\(--radius-sm\)/, `${sel} old density`)
}
for (const sel of ['.titlebar-menu-trigger', '.titlebar-btn', '.titlebar-icon-btn']) {
  assert.match(ruleBody(styles, sel), /padding-inline:\s*(?:8px|var\(--space-2\))/, `${sel} padding-inline`)
}
assert.match(ruleBody(styles, '.app-toolbar-version'), /padding-inline:\s*4px/)
assert.match(styles, /button\.layout-toggle-btn\s*\{[^}]*width:\s*32px/)
assert.match(styles, /button\.layout-toggle-btn\s*\{[^}]*height:\s*32px/)
assert.match(styles, /button\.layout-toggle-btn\s*\{[^}]*border:\s*none/)
assert.match(styles, /\.app-toolbar-layout[\s\S]*?\{[^}]*flex-wrap:\s*nowrap/)

const search = ruleBody(styles, '.titlebar-search-btn')
assert.match(search, /height:\s*32px/)
assert.match(search, /min-height:\s*32px/)
assert.match(search, /border-radius:\s*var\(--radius-md\)/)
assert.doesNotMatch(search, /border-radius:\s*(?:4|8)px/)

const titlebar = ruleBody(styles, '.app-titlebar')
assert.match(titlebar, /height:\s*40px/)
assert.match(titlebar, /max-height:\s*40px/)
assert.match(titlebar, /flex-wrap:\s*nowrap/)
assert.match(features, /\.app-titlebar\s*\{[^}]*white-space:\s*nowrap/)

const resizer = ruleBody(styles, '.layout-resizer')
assert.match(resizer, /width:\s*1px/)
assert.match(resizer, /background:\s*var\(--color-border-muted\)/)
assert.doesNotMatch(resizer, /color-accent|width:\s*[3-9]px/)
const hit = ruleBody(styles, '.layout-resizer::after')
assert.match(hit, /width:\s*7px/)
const resizerHover = ruleBody(styles, '.layout-resizer:hover,\n.layout-resizer:focus-visible,\nbody.layout-resizing .layout-resizer')
assert.match(resizerHover, /background:\s*var\(--color-accent\)/)

for (const sel of [
  '.titlebar-menu-item:hover',
  '.titlebar-more-menu button:hover',
  '.cmdp-item.is-active',
  '.session-context-menu-item:hover',
  '.tab-context-menu button:hover:not(:disabled)',
  '.ctx-menu-item > button:hover:not(:disabled)'
]) {
  const body = sel.startsWith('.ctx') || sel.startsWith('.tab') ? features : styles
  assert.match(ruleBody(body, sel), /background:\s*var\(--color-row-hover-bg\)/, sel)
}

assert.equal(css.includes('rgba(88, 166, 255, 0.18)'), false)
assert.equal(css.includes('rgba(88,166,255,0.18)'), false)
assert.match(ruleBody(styles, '.titlebar-menu-item'), /border-radius:\s*var\(--radius-md\)/)
assert.match(ruleBody(styles, '.titlebar-more-menu button'), /min-height:\s*32px/)
assert.match(ruleBody(styles, '.titlebar-more-menu button'), /border-radius:\s*var\(--radius-md\)/)
assert.doesNotMatch(ruleBody(styles, '.titlebar-more-menu button'), /border-radius:\s*4px/)

const status = ruleBody(styles, '.app-statusbar')
assert.match(status, /height:\s*28px/)
assert.match(status, /min-height:\s*28px/)
assert.match(status, /max-height:\s*28px/)
assert.match(status, /background:\s*var\(--color-bg-surface\)/)

assert.equal(css.match(/var\(\s*--[a-z0-9-]+\s*,\s*#/gi), null)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
const opsStart = toolbar.indexOf('OPS_BUTTONS')
const ops = toolbar.slice(opsStart, toolbar.indexOf(']', opsStart))
assert.equal((ops.match(/id: '/g) ?? []).length, 3)
assert.equal(toolbar.includes('className="primary"'), false)
assert.equal(toolbar.includes("className='primary'"), false)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.46')

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
const n1 = unreleased.indexOf('UI-N1')
const n5 = unreleased.indexOf('UI-N5')
const polish3 = unreleased.indexOf('Polish-3')
assert.ok(n1 >= 0 && n5 > n1 && n5 < polish3, 'UI-N5 sits after UI-N1')
const n5Bullet = unreleased.slice(n5, polish3)
assert.match(n5Bullet, /Public HOLD/)
assert.match(n5Bullet, /0\.4\.4/)
assert.match(n5Bullet, /--color-row-hover-bg/)
assert.match(n5Bullet, /--radius-md/)

console.log('test-ui-n5 ok')
