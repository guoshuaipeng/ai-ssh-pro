/** UI-N7: selection chrome vs focus ring, info-banner tokens, weight/radius cleanup. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const m2 = readFileSync('src/renderer/src/styles-m2.css', 'utf8')
const css = `${styles}\n${features}\n${m2}`

function rules(source: string): Array<{ selector: string; body: string }> {
  const out: Array<{ selector: string; body: string }> = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) out.push({ selector: m[1]!, body: m[2]! })
  return out
}

const all = rules(css)

function body(selector: string): string {
  const rule = all.find((r) => r.selector.replace(/\/\*[\s\S]*?\*\//g, '').trim() === selector)
  assert.ok(rule, `missing ${selector}`)
  return rule!.body
}

const sftp = body('.sftp-pane.is-active')
assert.match(sftp, /outline:\s*none/)
assert.match(sftp, /box-shadow:\s*inset\s+0\s+0\s+0\s+1px\s+var\(--color-accent\)/)
assert.doesNotMatch(sftp, /outline:\s*1px/)

const sftpFocus = body('.sftp-pane.is-active:focus-visible')
assert.match(sftpFocus, /outline:\s*2px\s+solid\s+var\(--color-focus-ring\)/)
assert.match(sftpFocus, /box-shadow:\s*none/)

const step = body('.w7-step.is-current')
assert.doesNotMatch(step, /outline/)
assert.match(step, /border-color:\s*var\(--color-accent\)/)
assert.match(step, /background:\s*var\(--color-row-selected-bg\)/)

const highlight = body('.w1-create.is-highlight')
assert.doesNotMatch(highlight, /outline/)
assert.match(highlight, /box-shadow:/)
assert.match(body('.w1-create.is-highlight:focus-visible'), /box-shadow:\s*none/)

const connecting = body('.session-disconnect-banner.session-connecting-banner')
assert.match(connecting, /background:\s*var\(--color-info-muted\)/)
assert.match(connecting, /color:\s*var\(--color-info\)/)
assert.doesNotMatch(connecting, /#[0-9a-fA-F]{3,8}\b/)

const info = body('.sidebar-info-banner')
assert.match(info, /background:\s*var\(--color-info-muted\)/)
assert.match(info, /color:\s*var\(--color-info\)/)
assert.doesNotMatch(info, /#[0-9a-fA-F]{3,8}\b/)
assert.doesNotMatch(info, /rgba\(/)

const gated = all.filter((r) =>
  /\.is-active\b|\.is-current\b|\.is-highlight\b|info-banner|connecting-banner/.test(r.selector)
)
assert.ok(gated.length >= 6, 'selection and info-banner rules are gated')
for (const rule of gated) {
  assert.doesNotMatch(rule.body, /#[0-9a-fA-F]{3,8}\b/, `${rule.selector.trim()} bare hex`)
  if (!/:focus-visible/.test(rule.selector)) {
    for (const decl of rule.body.match(/outline\s*:[^;]+/g) ?? []) {
      assert.match(decl, /^outline\s*:\s*none\s*$/, `${rule.selector.trim()} outline-as-selection`)
    }
  }
}

assert.equal(css.includes('#0b2a4a'), false)
assert.equal(css.includes('#9cdcfe'), false)
assert.doesNotMatch(css, /font-weight:\s*650/)
assert.doesNotMatch(css, /border-radius:\s*14px/)
assert.match(body('.ai-explain-hint'), /border-radius:\s*var\(--radius-xl\)/)
assert.match(styles, /--radius-xl:\s*10px/)
assert.match(styles, /--fw-semibold:\s*600/)
assert.equal(css.match(/var\(\s*--[a-z0-9-]+\s*,\s*#/gi), null)

assert.match(
  styles,
  /button\.primary:focus-visible,\s*button\.danger:focus-visible,\s*button\.primary\.danger:focus-visible\s*\{[^}]*outline:\s*none[^}]*0 0 0 2px var\(--color-focus-ring-offset\), 0 0 0 4px var\(--color-focus-ring\)/
)

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.equal(toolbar.includes('className="primary"'), false)
assert.equal(toolbar.includes("className='primary'"), false)
const welcome = readFileSync('src/renderer/src/components/WelcomePanel.tsx', 'utf8')
assert.equal(welcome.includes('className="primary"'), false)
assert.equal((welcome.match(/className="secondary"/g) ?? []).length, 3)
assert.doesNotMatch(css, /child_process|auto-?exec|BEGIN [A-Z ]*PRIVATE KEY/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /scripts\/test-ui-n7\.ts/)

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
const n6 = unreleased.indexOf('UI-N6')
const n7 = unreleased.indexOf('UI-N7')
const polish3 = unreleased.indexOf('Polish-3')
assert.ok(n6 >= 0 && n7 > n6 && n7 < polish3, 'UI-N7 sits after UI-N6')
const n7Bullet = unreleased.slice(n7, polish3)
assert.match(n7Bullet, /Public HOLD/)
assert.match(n7Bullet, /0\.4\.4/)
assert.match(n7Bullet, /--color-info-muted/)
assert.match(n7Bullet, /--color-info/)
assert.match(n7Bullet, /--radius-xl/)
assert.match(n7Bullet, /:focus-visible/)

console.log('test-ui-n7 ok')
