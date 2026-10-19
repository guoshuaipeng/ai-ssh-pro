/** Polish-34 / M-polish-19: AI chat panel, Cursor-style. Package 0.6.57. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { changelogFor } from '../src/shared/changelog'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const pkg = JSON.parse(norm('package.json')) as { version: string; scripts: Record<string, string> }
assert.ok(pkg.version.localeCompare('0.6.57', undefined, { numeric: true }) >= 0)
assert.match(pkg.scripts['test:parts'], /test-polish-34/)

const ai = norm('src/renderer/src/components/AIPanel.tsx')
// Header: one row — context, shortcut, new chat, ⋯. No safety selects / model select / title text up here.
const header = ai.slice(ai.indexOf('<div className="ai-header">'), ai.indexOf('<div className="ai-messages">'))
assert.ok(header.includes('data-testid="ai-session-context"'))
assert.ok(header.includes('data-testid="ai-new-chat"') && header.includes("tg('ai.newChat')"))
assert.ok(header.includes('data-testid="ai-more"'))
assert.ok(header.includes('data-testid="ai-focus-shortcut-hint"'))
assert.equal(header.includes('data-testid="safety-session"'), false)
assert.equal(header.includes('data-testid="ai-provider-select"'), false)
assert.equal(header.includes("tg('ai.title')"), false)

// Composer: textarea, then a chip row with model / safety / attach / console and the round send.
const composer = ai.slice(ai.indexOf('data-testid="ai-composer"'), ai.indexOf('{inputMenu ? ('))
const order = ['<textarea', 'data-testid="ai-composer-bar"', 'data-testid="ai-provider-select"', 'data-testid="ai-safety-chip"', 'data-testid="ai-attach-output"', 'data-testid="ai-send-console"', 'data-testid="ai-send"']
let at = -1
for (const k of order) {
  const i = composer.indexOf(k)
  assert.ok(i > at, `composer order: ${k}`)
  at = i
}
assert.ok(composer.includes('data-testid="safety-scope"') && composer.includes('data-testid="safety-session"') && composer.includes('data-testid="safety-host"'), 'session + host tiers live in the safety popover')
assert.ok(composer.includes('aria-pressed={includeTerminal'), 'attach output is a toggle chip')
assert.ok(composer.includes('data-testid="ai-stop"') && composer.includes('onClick={stopGeneration}'), 'send turns into stop while busy')
assert.equal(ai.includes('className="ai-toolbar"'), false, 'old checkbox toolbar removed')
assert.equal(ai.includes('type="checkbox"'), false)

// Model chip: short label, full id in the tooltip, chip shrinks within bounds.
assert.ok(ai.includes('export function shortModelName(') && ai.includes('{shortModelName(m)}') && ai.includes('title={m}'))
// Replies: meta line, single command block with risk tag, dedupe.
assert.ok(ai.includes('function ReplyMeta(') && ai.includes("tg('ai.workedFor'"))
assert.ok(ai.includes('data-testid="ai-cmd-block"') && ai.includes('className="ai-cmd-head"'))
assert.ok(ai.includes('function coveredBy(') && ai.includes('skipCommand={s.command}'))
assert.equal(ai.includes('<div className="ai-card-head">'), false, 'no risk pill header on every card')
assert.ok(ai.includes('elapsedMs'))

const css = norm('src/renderer/src/styles.css')
const block = css.slice(css.indexOf('---- M19 (0.6.57)'))
assert.ok(block.length > 100)
assert.match(block, /\.ai-panel \.msg\.assistant\.ai-dark-card,[\s\S]*?border:\s*0/)
assert.match(block, /\.ai-panel \.msg\.user\s*\{[^}]*align-self:\s*stretch/)
assert.match(block, /\.ai-panel \.ai-finding,[\s\S]*?border:\s*0/)
assert.match(block, /\.ai-safety-pop\s*\{[^}]*bottom:/)
assert.match(block, /\.ai-panel \.ai-composer \.ai-composer-send\s*\{[^}]*border-radius:\s*var\(--radius-full\)/)
assert.equal(/var\(--[a-z0-9-]+,\s*[^)]/.test(block), false, 'no token fallbacks')

assert.match(block, /\.ai-model-chip\s*\{[^}]*flex:\s*0 1 auto[^}]*min-width:\s*64px[^}]*max-width:\s*132px/)
assert.match(block, /@container \(max-width: 300px\)[\s\S]*\.ai-console-chip span\s*\{\s*display:\s*none/)

const i18n = norm('src/renderer/src/lib/i18n.tsx')
for (const k of ['ai.newChat', 'ai.workedFor', 'ai.safetyChipTip', 'ai.consoleChip']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh + en`)
}

const changelog = norm('CHANGELOG.md')
const unreleased = changelog.slice(changelog.indexOf('## Unreleased'), changelog.indexOf('## v', changelog.indexOf('## Unreleased')))
assert.equal(unreleased.replace('## Unreleased', '').trim(), '')
const note = changelog.slice(changelog.indexOf('## v0.6.57'), changelog.indexOf('## v0.6.56'))
assert.ok(note.includes('M-polish-19'))
const entries = changelogFor('0.6.57')
assert.ok(entries.length >= 1 && entries.every((e) => e.text.zh && e.text.en && e.where?.zh && e.where?.en))

console.log('test-polish-34 ok')
