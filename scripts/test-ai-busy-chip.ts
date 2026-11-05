/** R10 polish: AI header busy chip + unified generating copy. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const panel = readFileSync('src/renderer/src/components/AIPanel.tsx', 'utf8').replace(/\r\n/g, '\n')
assert.ok(panel.includes('data-testid="ai-busy-chip"'), 'busy chip testid')
assert.ok(panel.includes("tg('ai.busy')"), 'chip uses ai.busy')
assert.ok(/\{busy \? \([\s\S]*?ai-busy-chip[\s\S]*?\) : null\}/.test(panel), 'chip mounts only when busy')
assert.ok(panel.includes('ai-header-shortcut'), 'chip sits in header chrome')

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("'ai.busy': \"正在生成…\"") || i18n.includes("'ai.busy': '正在生成…'"), 'zh ai.busy aligned')
assert.ok(i18n.includes("'ai.busy': \"Generating…\"") || i18n.includes("'ai.busy': 'Generating…'"), 'en ai.busy')
assert.ok(i18n.includes('正在生成…'), 'streaming copy family present')
assert.equal(i18n.includes("'ai.busy': \"生成中…\""), false, 'old short zh copy removed')

const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.ok(css.includes('.ai-busy-chip'), 'chip styles')
assert.equal(/\.ai-busy-chip\s*\{[^}]*var\([^)]+,\s*[^)]+\)/.test(css), false, 'no token fallbacks on busy chip')

console.log('test-ai-busy-chip ok')
