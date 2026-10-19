/** Polish-30 / M-polish-15: overlay radius + elevation scale, AI chat parity, protection edge. Package 0.6.53. tipSuggest unchanged. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'
import { tipSuggest, rollback } from '../src/main/core-a-output-truncate'
import { splitFences, splitInlineCode, layoutOpsReply } from '../src/shared/ai-reply-cards'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.equal((pkg.scripts['test:parts'] || pkg.scripts.test).includes('scripts/test-polish-30.ts'), true)
assert.equal(tipSuggest, '0.4.14-polish13')
assert.equal(rollback, '0.4.13-polish12')

const norm = (f: string) => readFileSync(f, 'utf8').replace(/\r\n/g, '\n')
const styles = norm('src/renderer/src/styles.css')
const features = norm('src/renderer/src/features.css')
const body = (css: string, sel: string) => {
  const re = new RegExp('(^|\\n)' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')
  const m = re.exec(css)
  assert.ok(m, `missing rule ${sel}`)
  return m[2]
}

// 1. Tokens: overlay radius scale + elevation scale (DataAI: dialog/palette 14, menus 10).
assert.match(styles, /--radius-xl:\s*10px/)
assert.match(styles, /--radius-2xl:\s*14px/)
assert.match(styles, /--radius-dialog:\s*var\(--radius-2xl\)/)
assert.match(styles, /--radius-popover:\s*var\(--radius-xl\)/)
for (const tok of ['--shadow-sm', '--shadow-menu', '--shadow-modal', '--shadow-palette']) assert.ok(styles.includes(tok + ':'), tok)
const root = styles.slice(styles.indexOf(':root {'), styles.indexOf("[data-ui-theme='light'] {\n  /* M15"))
assert.match(root, /--shadow-modal:\s*0 16px 40px rgba\(0, 0, 0, 0\.38\), inset 0 1px 0/)
assert.match(root, /--shadow-palette:\s*0 24px 64px rgba\(0, 0, 0, 0\.55\)/)
for (const theme of ['light', 'sand']) {
  const block = styles.slice(styles.indexOf(`[data-ui-theme='${theme}'] {\n  /* M15`))
  const head = block.slice(0, block.indexOf('}'))
  for (const tok of ['--shadow-sm', '--shadow-menu', '--shadow-modal', '--shadow-palette']) assert.ok(head.includes(tok + ':'), `${theme} ${tok}`)
  assert.doesNotMatch(head, /rgba\(0, 0, 0, 0\.4/, `${theme} keeps the dark smudge`)
}
// Dialog-class surfaces
for (const [css, sel] of [[styles, '.modal-panel'], [styles, '.cmdp'], [features, '.welcome-card'], [features, '.ux60-card']] as const) {
  assert.match(body(css, sel), /border-radius:\s*var\(--radius-dialog\)/, sel)
}
assert.match(body(styles, '.cmdp'), /box-shadow:\s*var\(--shadow-palette\)/)
assert.match(body(styles, '.modal-panel'), /box-shadow:\s*var\(--shadow-modal\)/)
// Menus / popovers
const popovers: Array<[string, string]> = [
  [styles, '.titlebar-menu-dropdown'], [styles, '.tab-overflow-menu'], [styles, '.session-context-menu'],
  [styles, '.session-context-submenu'], [styles, '.sftp-advanced-body'],
  [features, '.command-input-field .command-input-suggest'], [features, '.titlebar-popover'], [features, '.tab-context-menu'],
  [features, '.tour-bubble'], [features, '.inv20-more-menu'], [features, '.st-more-menu'], [features, '.session-command-more-menu'],
  [features, '.ctx-menu'], [features, '.titlebar-hamburger-menu'], [features, '.l7-more, .l2-prefs']
]
for (const [css, sel] of popovers) {
  const b = body(css, sel)
  assert.match(b, /border-radius:\s*var\(--radius-popover\)/, sel)
  assert.match(b, /box-shadow:\s*var\(--shadow-(menu|modal)\)/, sel)
}

// 2. AI chat: Markdown fences + inline code, composer, header, bubbles.
const fenced = splitFences('先看状态：\n\n```bash\nsystemctl status nginx\ntail -n 5 /var/log/x\n```\n\n然后再说。')
assert.deepEqual(fenced, [
  { kind: 'text', text: '先看状态：' },
  { kind: 'code', code: 'systemctl status nginx\ntail -n 5 /var/log/x', lang: 'bash' },
  { kind: 'text', text: '然后再说。' }
])
assert.deepEqual(splitFences('no fences here'), [{ kind: 'text', text: 'no fences here' }])
assert.deepEqual(splitFences('a\n```\nstreaming…'), [{ kind: 'text', text: 'a' }, { kind: 'code', code: 'streaming…', lang: '' }], 'unclosed fence runs to the end')
assert.deepEqual(splitFences('```sh\r\nls\r\n```'), [{ kind: 'code', code: 'ls', lang: 'sh' }], 'CRLF')
assert.deepEqual(splitFences(''), [])
assert.deepEqual(splitInlineCode('检查 `pm.max_children` 与内存'), [
  { kind: 'text', text: '检查 ' },
  { kind: 'code', text: 'pm.max_children' },
  { kind: 'text', text: ' 与内存' }
])
assert.deepEqual(splitInlineCode('no code'), [{ kind: 'text', text: 'no code' }])
assert.deepEqual(splitInlineCode('a `` b'), [{ kind: 'text', text: 'a `` b' }], 'empty span is prose')
// Ops layout of a fence-free reply is unchanged.
assert.equal(layoutOpsReply('1) 负载 85% 偏高\n结论：需关注').blocks.length, 2)

const ai = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(ai.includes('function AiCodeBlock'))
assert.ok(ai.includes('data-testid="ai-code-block"'))
assert.ok(ai.includes('className="ai-inline-code"'))
assert.ok(ai.includes('const fences = splitFences(text)'))
assert.ok(ai.includes('<div className="ai-composer" data-testid="ai-composer">'))
const composer = ai.slice(ai.indexOf('data-testid="ai-composer"'))
assert.ok(composer.indexOf('<textarea') < composer.indexOf('data-testid="ai-send"'), 'send lives inside the composer, after the textarea')
assert.ok(ai.includes('data-testid="ai-send"') && ai.includes("tg('ai.send')"), 'send testid + label kept')
assert.ok(ai.includes("if (tgt?.closest?.('.ai-input-row')) return"), 'input-row hotkey guard kept')

const chat = styles.slice(styles.indexOf('---- M15 AI chat'))
assert.ok(chat.length > 0)
const rule = (sel: string) => {
  const i = chat.indexOf('\n' + sel + ' {')
  assert.ok(i >= 0, `missing ${sel}`)
  return chat.slice(i, chat.indexOf('}', i))
}
assert.match(rule('.msg.user'), /color-mix\(in srgb, var\(--color-accent\) 14%, var\(--color-bg-surface\)\)/)
assert.match(rule('.msg.user'), /border-radius:\s*var\(--radius-xl\) var\(--radius-xl\) var\(--radius-sm\) var\(--radius-xl\)/)
assert.match(rule('.msg'), /font-size:\s*var\(--fs-base\)/)
assert.match(rule('.ai-composer'), /border-radius:\s*var\(--radius-xl\)/)
assert.match(rule('.ai-composer:focus-within'), /border-color:\s*var\(--color-accent\)/)
assert.match(rule('.ai-input-row .ai-composer textarea'), /border:\s*0/)
assert.match(rule('.ai-code-block'), /background:\s*var\(--color-bg-code\)/)
assert.match(rule('.ai-code-pre'), /font-family:\s*var\(--font-mono\)/)
assert.match(rule('.ai-code-pre'), /overflow-x:\s*auto/)
assert.match(rule('.ai-inline-code'), /font-family:\s*var\(--font-mono\)/)
assert.match(rule('.ai-safety-row'), /flex-wrap:\s*wrap/)
assert.match(rule('.ai-safety-row label'), /flex:\s*0 0 auto/)
assert.match(body(styles, '.ai-session-context'), /padding:\s*0;/, 'context row aligns with the title')
assert.doesNotMatch(chat, /#[0-9a-f]{3,8}\b/i, 'no hex in the chat batch')

// 3. Protection edge: same meaning, inset bar, muted on idle tabs; banner no longer under the terminal.
assert.match(styles, /\.tab \{[^}]*border-top:\s*2px solid transparent/, 'every tab reserves the 2px edge')
assert.match(features, /\.tab\.tab-guard-prod \{ --tab-guard-edge: color-mix\(in srgb, var\(--color-danger\) 55%, transparent\); \}/)
assert.match(features, /\.tab\.tab-guard-ro \{ --tab-guard-edge: color-mix\(in srgb, var\(--color-warn\) 55%, transparent\); \}/)
assert.match(features, /\.tab\.active\.tab-guard-prod \{ --tab-guard-edge: color-mix\(in srgb, var\(--color-danger\) 85%/)
const bar = body(features, '.tab.tab-guard-prod::before, .tab.tab-guard-ro::before')
assert.match(bar, /left:\s*var\(--radius-md\)/)
assert.match(bar, /right:\s*var\(--radius-md\)/)
assert.match(bar, /height:\s*2px/)
assert.match(bar, /background:\s*var\(--tab-guard-edge\)/)
assert.match(bar, /pointer-events:\s*none/)
const app = norm('src/renderer/src/App.tsx')
assert.ok(app.includes("const guardClass = !showRo && guardLevel === 'production' ? 'tab-guard-prod' : showRo ? 'tab-guard-ro' : ''"))
assert.ok(app.includes("const guardTip = showRo ? tg('s4.tip') : guardLevel === 'production' ? tg('l4.bannerProd') : ''"), 'tooltip still names the level')
assert.match(features, /\.terminal-stack > \.term-guard-banner \{ position: relative; z-index: 2; \}/)
assert.match(features, /\.terminal-stack:has\(> \.term-guard-banner\) > \.terminal-layer \{ top: 24px; \}/)
assert.match(features, /\.term-guard-banner \{[^}]*height: 24px/, 'layer offset matches the banner height')

// Screenshot harness
const shot = norm('scripts/screenshot-key-screens.mjs')
assert.ok(shot.includes("name: 'ai-chat'") && shot.includes("{ op: 'aiChat' }"))
assert.ok(shot.includes("process.env.AISS_SHOT_SET || ''"))
assert.ok(shot.includes('st.click'))
const hooks = norm('src/renderer/src/lib/screenshot-hooks.ts')
assert.ok(hooks.includes('{ op: "aiChat"; empty?: boolean }'))
assert.ok(ai.includes("if (detail?.op === 'aiChat')"))
assert.ok(ai.indexOf("if (detail?.op === 'aiChat')") > ai.indexOf('if (!screenshotHooksEnabled()) return'), 'aiChat demo is gated by screenshot hooks')

const changelog = norm('CHANGELOG.md')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.53'), changelog.indexOf('## v0.6.52'))
assert.ok(note.includes('M-polish-15'))
const entries = changelogFor('0.6.53')
assert.ok(entries.length >= 1)
assert.ok(entries.every((e) => e.text.zh && e.text.en && e.where?.zh && e.where?.en))

console.log('test-polish-30 ok')