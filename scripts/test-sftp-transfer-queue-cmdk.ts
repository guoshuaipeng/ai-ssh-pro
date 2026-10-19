/** CmdK: jump to SFTP transfer queue for active SSH session. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SHARED_MENUS } from '../src/shared/menus'

const item = SHARED_MENUS.flatMap((m) => m.items).find((it) => it.type === 'item' && it.id === 'sftpTransferQueue')
assert.ok(item && item.type === 'item')
assert.match(item.label.zh, /传输队列|队列/)
assert.match(item.label.en.toLowerCase(), /transfer queue|queue/)
assert.ok(item.needsSession)

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /action === 'sftpTransferQueue'/)
assert.match(app, /aiss-sftp-focus-queue/)
assert.match(app, /openSftpTransfer/)

const panel = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(panel, /aiss-sftp-focus-queue/)
assert.match(panel, /setQueueOpen\(true\)/)
assert.match(panel, /queuePanelRef/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.45')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-transfer-queue-cmdk/)
console.log('test-sftp-transfer-queue-cmdk ok')
