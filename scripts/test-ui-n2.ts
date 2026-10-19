/** UI-N2: solid primary buttons. Welcome/About secondary actions stay secondary. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const styles = readFileSync('src/renderer/src/styles.css', 'utf8').replace(/\r\n/g, '\n')
const features = readFileSync('src/renderer/src/features.css', 'utf8').replace(/\r\n/g, '\n')
const m2 = readFileSync('src/renderer/src/styles-m2.css', 'utf8').replace(/\r\n/g, '\n')
const css = `${styles}\n${features}\n${m2}`

function rule(source: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  assert.ok(m, `missing ${selector}`)
  return m[1]!
}

function decl(body: string, prop: string): string {
  const m = body.match(new RegExp(`(?:^|[^\\w-])${prop}\\s*:\\s*([^;]+)`, 'm'))
  assert.ok(m, `missing ${prop}`)
  return m[1]!.trim()
}

function relLum(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const ch = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

function themeHex(sel: string, prop: string): string {
  const i = styles.indexOf(sel)
  assert.ok(i >= 0, sel)
  const slice = styles.slice(i, i + 800)
  const m = slice.match(new RegExp(`${prop}:\\s*(#[0-9a-fA-F]{6})`))
  assert.ok(m, `${sel} ${prop}`)
  return m[1]!
}

const primary = rule(styles, 'button.primary')
const hover = rule(styles, 'button.primary:hover:not(:disabled)')
const danger = rule(styles, 'button.primary.danger,\n.primary.danger')
const dangerHover = rule(styles, 'button.primary.danger:hover:not(:disabled),\n.primary.danger:hover:not(:disabled)')

assert.equal(decl(primary, 'background'), 'var(--color-accent)')
assert.equal(decl(primary, 'border-color'), 'var(--color-accent)')
assert.equal(decl(primary, 'color'), 'var(--color-text-on-accent)')
assert.equal(decl(hover, 'background'), 'var(--color-accent-hover)')
assert.equal(decl(hover, 'border-color'), 'var(--color-accent-hover)')
assert.equal(decl(hover, 'color'), 'var(--color-text-on-accent)')
assert.equal(decl(danger, 'background'), 'var(--color-danger)')
assert.equal(decl(danger, 'border-color'), 'var(--color-danger)')
assert.equal(decl(danger, 'color'), 'var(--color-text-on-danger)')
assert.equal(decl(dangerHover, 'background'), 'var(--color-danger)')
assert.equal(decl(dangerHover, 'border-color'), 'var(--color-danger)')
assert.equal(decl(dangerHover, 'color'), 'var(--color-text-on-danger)')

for (const body of [primary, hover, danger, dangerHover]) {
  assert.doesNotMatch(body, /accent-dim/)
  assert.doesNotMatch(body, /var\(\s*--[a-z0-9-]+\s*,/i)
  assert.doesNotMatch(body, /#[0-9a-fA-F]{3,8}\b/)
  assert.doesNotMatch(body, /#e11d48/i)
}

assert.doesNotMatch(decl(danger, 'color'), /var\(--(?:color-)?danger\)/)
assert.doesNotMatch(decl(dangerHover, 'color'), /var\(--(?:color-)?danger\)/)
assert.equal(css.includes('#e11d48'), false, 'no bare rose-600 danger')
assert.equal(features.includes('button.primary.danger'), false, 'danger primary lives with button.primary')

const polish = styles.slice(styles.indexOf('/* Polish-1 tokens'))
const rootSlice = polish.slice(0, polish.indexOf("[data-ui-theme='light']"))
const rootInk = decl(rootSlice, '--color-text-on-accent')
const rootDangerInk = decl(rootSlice, '--color-text-on-danger')
const rootHover = decl(rootSlice, '--color-accent-hover')
const lightBody = polish.slice(polish.indexOf("[data-ui-theme='light']"), polish.indexOf("[data-ui-theme='sand']"))
const sandBody = polish.slice(polish.indexOf("[data-ui-theme='sand']"))
const lightInk = decl(lightBody, '--color-text-on-accent')
const sandInk = decl(sandBody, '--color-text-on-accent')
const lightDangerInk = decl(lightBody, '--color-text-on-danger')
const sandDangerInk = decl(sandBody, '--color-text-on-danger')
const lightHover = decl(lightBody, '--color-accent-hover')
const sandHover = decl(sandBody, '--color-accent-hover')

const pairs: Array<[string, string, string]> = [
  ['github-dark', themeHex("[data-ui-theme='github-dark']", '--color-accent'), rootInk],
  ['github-dark-hover', rootHover, rootInk],
  ['slate', themeHex("[data-ui-theme='slate']", '--color-accent'), rootInk],
  ['ocean', themeHex("[data-ui-theme='ocean']", '--color-accent'), rootInk],
  ['forest', themeHex("[data-ui-theme='forest']", '--color-accent'), rootInk],
  ['light', themeHex("[data-ui-theme='light']", '--color-accent'), lightInk],
  ['light-hover', lightHover, lightInk],
  ['sand', themeHex("[data-ui-theme='sand']", '--color-accent'), sandInk],
  ['sand-hover', sandHover, sandInk],
  ['github-dark-danger', themeHex("[data-ui-theme='github-dark']", '--color-danger'), rootDangerInk],
  ['slate-danger', themeHex("[data-ui-theme='slate']", '--color-danger'), rootDangerInk],
  ['ocean-danger', themeHex("[data-ui-theme='ocean']", '--color-danger'), rootDangerInk],
  ['forest-danger', themeHex("[data-ui-theme='forest']", '--color-danger'), rootDangerInk],
  ['light-danger', themeHex("[data-ui-theme='light']", '--color-danger'), lightDangerInk],
  ['sand-danger', themeHex("[data-ui-theme='sand']", '--color-danger'), sandDangerInk]
]
for (const [name, bg, fg] of pairs) {
  const ratio = contrast(bg, fg)
  assert.ok(ratio >= 4.5, `${name} contrast ${ratio.toFixed(2)}`)
}
assert.notEqual(lightHover.toLowerCase(), themeHex("[data-ui-theme='light']", '--color-accent').toLowerCase())
assert.notEqual(sandHover.toLowerCase(), themeHex("[data-ui-theme='sand']", '--color-accent').toLowerCase())
assert.notEqual(rootHover.toLowerCase(), themeHex("[data-ui-theme='github-dark']", '--color-accent').toLowerCase())

const welcome = readFileSync('src/renderer/src/components/WelcomePanel.tsx', 'utf8')
assert.equal((welcome.match(/className="secondary"/g) ?? []).length, 3)
assert.equal(welcome.includes('className="primary"'), false)

const about = readFileSync('src/renderer/src/components/AboutBlock.tsx', 'utf8')
assert.equal((about.match(/className="secondary"/g) ?? []).length, 2)
assert.equal((about.match(/className="primary"/g) ?? []).length, 1)
assert.ok(about.includes('about.whatsNew') && about.includes('about-github'))
const aboutActions = about.slice(about.indexOf('about-actions'))
assert.ok(aboutActions.indexOf('about-notes') > aboutActions.indexOf('className="primary"'))
assert.match(aboutActions, /data-testid="about-notes"[\s\S]*className="secondary"|className="secondary"[\s\S]*data-testid="about-notes"/)
assert.match(aboutActions, /data-testid="about-github"[\s\S]*className="secondary"|className="secondary"[\s\S]*data-testid="about-github"/)

const dialogs = readFileSync('src/renderer/src/lib/dialogs.tsx', 'utf8')
assert.match(dialogs, /className=\{danger \? 'primary danger' : 'primary'\}/)
const importer = readFileSync('src/renderer/src/components/ImportPreviewPanel.tsx', 'utf8')
assert.match(importer, /(className|variant)="primary"[^]*data-testid="import-apply"/)
const save = readFileSync('src/renderer/src/components/AuditExportModal.tsx', 'utf8')
assert.match(save, /(className|variant)="primary"[^]*data-testid="s1b-save"/)
const hostSave = readFileSync('src/renderer/src/components/HostInventoryModal.tsx', 'utf8')
assert.match(hostSave, /(className|variant)="primary"/)

assert.match(styles, /\.modal-footer\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(styles, /\.modal-footer > button,\s*\.workspace-panel-actions > button\s*\{[^}]*white-space:\s*nowrap/)
assert.match(features, /\.modal-actions\s*\{[^}]*flex-wrap:\s*nowrap/)
assert.match(features, /\.modal-actions > button\s*\{[^}]*white-space:\s*nowrap/)
assert.match(primary, /white-space:\s*nowrap/)
assert.match(primary, /min-height:\s*32px/)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.equal(toolbar.includes('className="primary"'), false)
assert.equal(toolbar.includes("className='primary'"), false)

/** accent-dim may remain on non-primary chrome. It must not be a primary or danger-primary fill. */
function cssRules(source: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) out.push({ selector: m[1]!, body: m[2]! })
  return out
}
const primarySelectors = /button\.primary|\.primary\.danger/
const primaryRules = cssRules(css).filter((r) => primarySelectors.test(r.selector))
assert.ok(primaryRules.length >= 4, 'primary and danger-primary rules are present')
for (const r of primaryRules) {
  assert.doesNotMatch(r.body, /accent-dim/, `${r.selector.trim()} uses accent-dim`)
}
const accentDimLines = styles.split('\n').filter((line) => line.includes('accent-dim'))
assert.ok(accentDimLines.length > 0, 'accent-dim still exists outside primary')
assert.deepEqual(
  accentDimLines.filter((line) => primarySelectors.test(line)),
  []
)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.58')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-ui-n2\.ts/)

const changelog = readFileSync('CHANGELOG.md', 'utf8').replace(/\r\n/g, '\n')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
const n2 = unreleased.indexOf('UI-N2')
const n7 = unreleased.indexOf('UI-N7')
assert.ok(n2 >= 0 && n2 < n7, 'UI-N2 is in Unreleased ahead of UI-N7')
const n2Bullet = unreleased.slice(n2, unreleased.indexOf('\n\n- **', n2))
assert.match(n2Bullet, /Public HOLD/)
assert.match(n2Bullet, /0\.4\.4/)
assert.match(n2Bullet, /--color-accent/)
assert.match(n2Bullet, /--color-danger/)
assert.match(n2Bullet, /accent-dim/)
assert.match(changelog, /## v0\.4\.5\n/)
assert.doesNotMatch(n2Bullet, /## v0\.4\.5/)

console.log('test-ui-n2 ok')
