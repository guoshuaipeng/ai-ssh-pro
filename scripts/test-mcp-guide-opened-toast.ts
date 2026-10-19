/** mcpGuide menu opens settings with a toast. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'mcpGuide'[\s\S]{0,220}showToast\(tg\('mcp\.guideOpened'\)\)/)
assert.match(app, /openUnifiedSettings\(sectionForAction\(action\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("mcp.guideOpened': '已打开 MCP 安装指南'"))
assert.ok(i18n.includes("mcp.guideOpened': 'Opened MCP setup guide'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.47')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-mcp-guide-opened-toast/)
console.log('test-mcp-guide-opened-toast ok')
