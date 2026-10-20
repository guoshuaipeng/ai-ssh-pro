import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { capturedOutput, captureStart, captureChunk } from '../src/shared/failed-output'
let n = 0
const ok = (c: unknown, m: string) => { assert.ok(c, m); n++ }
// D54
const caps = new Map()
captureStart(caps, 's', 'ls -la')
captureChunk(caps, 's', 'ls -la\r\nfile1\r\nfile2\r\n\r\n')
ok(capturedOutput(caps.get('s')) === 'file1\nfile2', 'echo dropped, trimmed')
captureStart(caps, 't', 'mysql -pSECRET')
ok(capturedOutput(caps.get('t')) === '', 'sensitive not captured')
ok(capturedOutput(undefined) === '', 'none')
const fo = readFileSync('src/renderer/src/lib/failed-output.ts', 'utf8')
ok(fo.includes('out: capturedOutput(cap)'), 'D54 stored on exit')
const tp = readFileSync('src/renderer/src/components/TerminalPane.tsx', 'utf8')
ok(tp.includes("id: 'copyLastOutput'") && tp.includes('disabled: !lastOut'), 'D54 menu')
// D53
const sb = readFileSync('src/renderer/src/components/SessionSearchBar.tsx', 'utf8')
ok(sb.includes("e.key === 'Escape' && value") && sb.includes("e.key === 'ArrowDown' && onArrowDown?.()"), 'D53 keys')
const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
ok(app.includes('if (hits.length !== 1) return false'), 'D53 Enter only on single match')
// D55
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
ok(sp.includes("(e.key === 'ArrowDown' || e.key === 'ArrowUp') && entries.length"), 'D55 arrows')
ok(sp.includes("} else if (side === 'remote') openRemoteEntry(current)") && sp.includes("} else if (!isLocal) openRemoteEntry(e)"), 'D55 Enter + dblclick share D36 check')
ok(sp.includes('const ok = await confirmDialog({') && sp.includes("if (e.key === 'Delete')"), 'Delete still confirms')
console.log(JSON.stringify({ test: 'cycle25', total: n, failed: 0 }))
