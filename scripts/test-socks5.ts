/** C1: SOCKS5 -D — parser units and an end-to-end CONNECT through a fake ssh2 client to a real local echo. */
import assert from 'node:assert/strict'
import net from 'node:net'
import { parseGreeting, parseRequest, socksReply, socksProxyUrl } from '../src/shared/socks5'
import { __resetForwardsForTest, listForwards, restoreForwards, startTrackedForward, stopSessionForwards } from '../src/main/forward-manager'

let n = 0
const ok = (s: string) => {
  n++
  console.log('ok -', s)
}
const B = (a: number[]) => Uint8Array.from(a)

{
  assert.deepEqual(parseGreeting(B([5])), { kind: 'more' })
  assert.deepEqual(parseGreeting(B([4, 1, 0])), { kind: 'bad' })
  assert.deepEqual(parseGreeting(B([5, 2, 2, 0])), { kind: 'ok', noAuth: true, used: 4 })
  assert.deepEqual(parseGreeting(B([5, 1, 2])), { kind: 'ok', noAuth: false, used: 3 })
  ok('greeting')
}
{
  assert.deepEqual(parseRequest(B([5, 1, 0, 1, 10, 0, 0, 5, 0, 80])), { kind: 'ok', host: '10.0.0.5', port: 80, used: 10 })
  const name = [...Buffer.from('grafana.lan')]
  assert.deepEqual(parseRequest(B([5, 1, 0, 3, name.length, ...name, 0x0b, 0xb8])), { kind: 'ok', host: 'grafana.lan', port: 3000, used: 7 + name.length })
  const v6 = parseRequest(B([5, 1, 0, 4, ...new Array(15).fill(0), 1, 0, 22]))
  assert.ok(v6.kind === 'ok' && v6.host === '0:0:0:0:0:0:0:1' && v6.port === 22)
  assert.deepEqual(parseRequest(B([5, 2, 0, 1, 1, 2, 3, 4, 0, 80])), { kind: 'bad', rep: 0x07 }, 'BIND unsupported')
  assert.deepEqual(parseRequest(B([5, 3, 0, 1, 1, 2, 3, 4, 0, 80])), { kind: 'bad', rep: 0x07 }, 'UDP unsupported')
  assert.deepEqual(parseRequest(B([5, 1, 0, 9])), { kind: 'bad', rep: 0x08 })
  assert.deepEqual(parseRequest(B([5, 1, 0, 3, 5, 97])), { kind: 'more' })
  assert.deepEqual([...socksReply(0)], [5, 0, 0, 1, 0, 0, 0, 0, 0, 0])
  assert.equal(socksProxyUrl(1080), 'socks5h://127.0.0.1:1080')
  ok('request parsing and replies')
}

function readN(s: net.Socket, nBytes: number): Promise<Buffer> {
  return new Promise((resolve) => {
    let acc = Buffer.alloc(0)
    const on = (d: Buffer) => {
      acc = Buffer.concat([acc, d])
      if (acc.length >= nBytes) {
        s.off('data', on)
        resolve(acc)
      }
    }
    s.on('data', on)
  })
}

async function main() {
  const echo = net.createServer((s) => s.on('data', (d) => s.write(Buffer.concat([Buffer.from('echo:'), d]))))
  await new Promise<void>((r) => echo.listen(0, '127.0.0.1', () => r()))
  const echoPort = (echo.address() as net.AddressInfo).port
  const asked: string[] = []
  const fake = {
    forwardOut(_sip: string, _sp: number, host: string, port: number, cb: (e: Error | undefined, s?: net.Socket) => void) {
      asked.push(`${host}:${port}`)
      if (host === 'down.lan') return cb(new Error('Connection refused'))
      // pretend the SSH server reached host:port; we connect to the echo server instead
      const s = net.connect(echoPort, '127.0.0.1', () => cb(undefined, Object.assign(s, { close: () => s.destroy() })))
    }
  }

  const f = await startTrackedForward('d1', fake as never, { direction: 'D', localPort: 0, remoteHost: '*', remotePort: 0 }, 'manual')
  assert.equal(f.direction, 'D')
  assert.equal(f.status, 'listening')
  assert.ok(f.localPort > 0)
  ok('-D listens on 127.0.0.1')

  const c = net.connect(f.localPort, '127.0.0.1')
  await new Promise<void>((r) => c.once('connect', () => r()))
  c.write(B([5, 1, 0]))
  assert.deepEqual([...(await readN(c, 2))], [5, 0])
  const name = [...Buffer.from('grafana.lan')]
  c.write(B([5, 1, 0, 3, name.length, ...name, 0x0b, 0xb8]))
  const rep = await readN(c, 10)
  assert.equal(rep[1], 0)
  c.write('ping')
  assert.equal((await readN(c, 9)).toString(), 'echo:ping')
  assert.deepEqual(asked, ['grafana.lan:3000'])
  const row = listForwards('d1')[0]!
  assert.equal(row.lastTarget, 'grafana.lan:3000')
  assert.equal(row.totalConnections, 1)
  assert.ok(row.bytesIn >= 9 && row.bytesOut >= 4)
  c.destroy()
  ok('CONNECT by domain tunnels through forwardOut; target and traffic recorded')

  const c2 = net.connect(f.localPort, '127.0.0.1')
  await new Promise<void>((r) => c2.once('connect', () => r()))
  c2.write(B([5, 1, 0]))
  await readN(c2, 2)
  const dn = [...Buffer.from('down.lan')]
  c2.write(B([5, 1, 0, 3, dn.length, ...dn, 0, 80]))
  assert.equal((await readN(c2, 10))[1], 0x05)
  assert.match(listForwards('d1')[0]!.lastError ?? '', /down\.lan/)
  c2.destroy()
  ok('unreachable target answers 0x05 and records the error')

  const c3 = net.connect(f.localPort, '127.0.0.1')
  await new Promise<void>((r) => c3.once('connect', () => r()))
  c3.write(B([5, 1, 2]))
  assert.deepEqual([...(await readN(c3, 2))], [5, 0xff])
  c3.destroy()
  ok('clients without no-auth are rejected')

  assert.equal(stopSessionForwards('d1'), 1)
  const r = await restoreForwards('d1', 'd2', fake as never, false)
  assert.equal(r.restored.length, 1, '-D is restored even when read-only (it does not change the server)')
  assert.equal(r.restored[0]!.direction, 'D')
  ok('reconnect restores -D')

  __resetForwardsForTest()
  echo.close()
  console.log(`\n${n} passed`)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
