/** UI-N6: EmptyState kit — shared icon slot, token type, one app-mark path. */
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, win32 } from 'node:path'
import { ICON_PATHS } from '../src/shared/icon-registry'
import { APP_MARK_PATH, EMPTY_ICON_SIZE, EMPTY_ICON_SIZE_COMPACT, EMPTY_ICON_STROKE, EMPTY_ICONS } from '../src/renderer/src/components/emptyIcons'
import { translate } from '../src/renderer/src/lib/i18n'

const styles = readFileSync('src/renderer/src/styles.css', 'utf8')
const features = readFileSync('src/renderer/src/features.css', 'utf8')
const css = `${styles}\n${features}`

function emptyStateRules(source: string): Array<{ selector: string; body: string }> {
  const rules: Array<{ selector: string; body: string }> = []
  const re = /([^{}]+)\{([^{}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    if (m[1]!.includes('.empty-state')) rules.push({ selector: m[1]!, body: m[2]! })
  }
  return rules
}

const rules = emptyStateRules(features)
assert.ok(rules.length >= 8, 'empty-state rules exist')
const joined = rules.map((r) => `${r.selector}{${r.body}}`).join('\n')

assert.doesNotMatch(joined, /font-size:\s*\d+(?:\.\d+)?px/, 'no bare px font-size in .empty-state*')
assert.doesNotMatch(joined, /(?<![\d.])(?:15|13|12|32|22)px/, 'no hardcoded 15/13/12/32/22px in .empty-state*')
assert.doesNotMatch(joined, /gap:\s*6px/, 'no gap:6px in .empty-state*')
assert.doesNotMatch(joined, /line-height:\s*1\.8/, 'no line-height:1.8 in .empty-state*')
assert.equal(joined.includes('var(--token'), false)
assert.equal(css.match(/var\(\s*--[a-z0-9-]+\s*,\s*#/gi), null)

function body(selector: string): string {
  const rule = rules.find((r) => r.selector.replace(/\/\*[\s\S]*?\*\//g, '').trim() === selector)
  assert.ok(rule, `missing ${selector}`)
  return rule!.body
}

assert.match(body('.empty-state-title'), /font-size:\s*var\(--fs-lg\)/)
assert.match(body('.empty-state-title'), /font-weight:\s*var\(--fw-semibold\)/)
assert.match(body('.empty-state-title'), /white-space:\s*nowrap/)
assert.match(body('.empty-state-desc'), /font-size:\s*var\(--fs-sm\)/)
assert.match(body('.empty-state-desc'), /line-height:\s*var\(--lh-normal\)/)
assert.match(body('.empty-state-desc'), /color:\s*var\(--color-text-muted\)/)
assert.match(body('.empty-state--compact'), /gap:\s*var\(--space-2\)/)
assert.match(body('.empty-state'), /flex-direction:\s*column/)
assert.match(body('.empty-state'), /flex-wrap:\s*nowrap/)
assert.match(body('.empty-state-icon'), /width:\s*var\(--space-7\)/)
assert.match(body('.empty-state-icon'), /height:\s*var\(--space-7\)/)
assert.match(body('.empty-state-icon'), /color:\s*var\(--color-text-muted\)/)
assert.match(body('.empty-state-icon svg'), /stroke-width:\s*1\.5/)
assert.match(styles, /--space-7:\s*48px/)
assert.match(styles, /--space-6:\s*32px/)
assert.match(styles, /--fs-lg:\s*15px/)
assert.match(styles, /--fs-sm:\s*12px/)
assert.match(styles, /--fw-semibold:\s*600/)
assert.match(styles, /--lh-normal:\s*1\.5/)

const compactIcon = rules.find((r) => r.selector.includes('.empty-state--compact .empty-state-icon'))
assert.ok(compactIcon)
assert.match(compactIcon!.body, /width:\s*var\(--space-6\)/)
assert.match(compactIcon!.body, /height:\s*var\(--space-6\)/)

const compactActions = rules.find((r) => r.selector.includes('.empty-state--compact .empty-state-secondary'))
assert.ok(compactActions)
assert.match(compactActions!.body, /flex-direction:\s*column/)

assert.equal(EMPTY_ICON_STROKE, 1.5)
assert.equal(EMPTY_ICON_SIZE, 48)
assert.equal(EMPTY_ICON_SIZE_COMPACT, 32)
for (const key of ['host', 'sftp', 'snippet', 'forward', 'alert', 'audit'] as const) {
  assert.ok(ICON_PATHS[EMPTY_ICONS[key]], `${key} maps to a real icon`)
}
assert.equal(new Set(Object.values(EMPTY_ICONS)).size, Object.values(EMPTY_ICONS).length, 'each surface has its own glyph')

const kit = readFileSync('src/renderer/src/components/EmptyState.tsx', 'utf8')
assert.match(kit, /className="primary empty-state-primary"/)
assert.match(kit, /className="link-btn"/)
assert.match(kit, /strokeWidth=\{EMPTY_ICON_STROKE\}/)
assert.match(kit, /EMPTY_ICON_SIZE_COMPACT/)
assert.doesNotMatch(kit, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
assert.doesNotMatch(kit, /child_process|exec\(|auto-?exec|privateKey|password/i)

const icons = readFileSync('src/renderer/src/components/emptyIcons.ts', 'utf8')
assert.equal(icons.split(APP_MARK_PATH).length - 1, 1)
assert.ok(APP_MARK_PATH.includes('M14 23l5 4-5 4'), 'prompt chevron stays on the shared face')
assert.doesNotMatch(icons, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)

/** Repo-relative asserts use `/`. Windows `path.join` emits `\`. */
function repoPath(p: string): string {
  return p.replace(/\\/g, '/')
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p)
  }
  return out
}
const emptyIconsPath = 'src/renderer/src/components/emptyIcons.ts'
const pathHits = walk('src')
  .filter((f) => readFileSync(f, 'utf8').includes(APP_MARK_PATH))
  .map(repoPath)
assert.deepEqual(pathHits, [repoPath(emptyIconsPath)])
assert.equal(
  repoPath(win32.join('src', 'renderer', 'src', 'components', 'emptyIcons.ts')),
  emptyIconsPath,
  'Windows path.join still matches the forward-slash expect'
)

const brand = readFileSync('src/renderer/src/components/BrandMark.tsx', 'utf8')
assert.match(brand, /d=\{APP_MARK_PATH\}/)
assert.match(brand, /strokeWidth=\{EMPTY_ICON_STROKE\}/)
assert.doesNotMatch(brand, /<rect/)
for (const file of ['src/renderer/src/components/WelcomePanel.tsx', 'src/renderer/src/components/AboutBlock.tsx']) {
  const text = readFileSync(file, 'utf8')
  assert.match(text, /import BrandMark from '\.\/BrandMark'/)
  assert.match(text, /<BrandMark/)
  assert.doesNotMatch(text, /<svg|<path|<rect/)
}

const surfaces: Record<string, string> = {
  'src/renderer/src/App.tsx': 'icon="host"',
  'src/renderer/src/components/SftpPanel.tsx': 'icon="sftp"',
  'src/renderer/src/components/SnippetsPanel.tsx': 'icon="snippet"',
  'src/renderer/src/components/PortForwardModal.tsx': 'icon="forward"',
  'src/renderer/src/components/AlertWorkbenchTab.tsx': 'icon="alert"',
  'src/renderer/src/components/AuditLogPanel.tsx': 'icon="audit"'
}
assert.ok(Object.keys(surfaces).length >= 3)
for (const [file, needle] of Object.entries(surfaces)) {
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(needle), `${file} uses ${needle}`)
  assert.doesNotMatch(text, /icon="[^"]*[\u{1F300}-\u{1FAFF}]/u)
}
const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(sftp, /: 'sftp'/)
assert.match(readFileSync('src/renderer/src/components/HostPicker.tsx', 'utf8'), /icon="host"/)
assert.match(readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8'), /icon="host"/)
assert.match(readFileSync('src/renderer/src/components/OpsHomeTab.tsx', 'utf8'), /icon="alert"/)

const zh = (key: Parameters<typeof translate>[1]) => translate('zh-CN', key)
assert.equal(zh('ux08.sidebarTitle'), '还没有连接')
assert.equal(zh('pf4.sftpTitle'), '连接后即可传文件')
assert.equal(zh('pf4.snipTitle'), '把常用命令存成片段')
assert.equal(zh('pf4.fwdTitle'), '还没有转发规则')
assert.equal(zh('pf4.alertTitle'), '当前没有告警')
assert.equal(zh('pf4.auditTitle'), '还没有审计记录')

const toolbar = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.equal(toolbar.includes('className="primary"'), false)
assert.equal(toolbar.includes("className='primary'"), false)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }
assert.equal(pkg.version, '0.6.43')

const changelog = readFileSync('CHANGELOG.md', 'utf8')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v0.4.4'))
const n5 = unreleased.indexOf('UI-N5')
const n6 = unreleased.indexOf('UI-N6')
const polish3 = unreleased.indexOf('Polish-3')
assert.ok(n5 >= 0 && n6 > n5 && n6 < polish3, 'UI-N6 sits after UI-N5')
const n6Bullet = unreleased.slice(n6, polish3)
assert.match(n6Bullet, /Public HOLD/)
assert.match(n6Bullet, /0\.4\.4/)
assert.match(n6Bullet, /--color-text-muted/)
assert.match(n6Bullet, /--fs-lg/)
assert.match(n6Bullet, /--space-2/)

console.log('test-ui-n6 ok')
