import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { execBounded } from '../src/main/ssh-batch'

function fakeClient(chunks: Buffer[]) {
  return {
    exec(_cmd: string, cb: (err: Error | undefined, ch: any) => void) {
      const ch: any = new EventEmitter()
      ch.stderr = new EventEmitter()
      ch.close = () => {}
      ch.destroy = () => {}
      cb(undefined, ch)
      setImmediate(() => {
        for (const c of chunks) ch.emit('data', c)
        ch.emit('close', 0)
      })
    }
  } as any
}

const bytes = Buffer.from('\u001b[32m你好世界\u001b[0m', 'utf8')
// split in the middle of a 3-byte char
const r = await execBounded(fakeClient([bytes.subarray(0, 7), bytes.subarray(7)]), 'x', 2000)
assert.equal(r.stdout, '你好世界')
assert.equal(r.truncated, false)

const big = Buffer.from('汉'.repeat(10), 'utf8') // 30 bytes
const t = await execBounded(fakeClient([big]), 'x', 2000, 10)
assert.equal(t.truncated, true)
assert.equal(t.stdout, '汉汉汉') // 9 bytes kept intact, partial 4th dropped
assert.equal(t.stdout.includes('\uFFFD'), false)
console.log('ssh-batch ok')
