/** B3: remote (-R) forwarding — spec parsing, read-only gate, carry-over, and a fake-client data path. */
import assert from 'node:assert/strict'
import net from 'node:net'
import { EventEmitter } from 'node:events'
import { PassThrough, Duplex } from 'node:stream'
import {
  CarryStore,
  exposesBeyondLoopback,
  parseRemoteSpec,
  remoteForwardBlockReason,
  remoteForwardLabel
} from '../src/shared/remote-forward'
import {
  __resetForwardsForTest,
  listForwards,
  restoreForwards,
  startTrackedForward,
  stopForward,
  stopSessionForwards
} from '../src/main/forward-manager'

let passed = 0
const ok = (name: string) => {
  passed++
  console.log('ok -', name)
}

// ---- pure helpers
{
  const r = parseRemoteSpec({ remotePort: 9000, localPort: 3000 })
  assert.ok(r.ok)
  if (r.ok) assert.deepEqual(r.spec, { bindAddr: '127.0.0.1', bindPort: 9000, localHost: '127.0.0.1', localPort: 3000 })
  assert.equal(parseRemoteSpec({ remotePort: 70000, localPort: 1 }).ok, false)
  assert.equal(parseRemoteSpec({ remotePort: 0, localPort: 22 }).ok, true)
  const bad = parseRemoteSpec({ remotePort: 9000, localPort: 0 })
  assert.ok(!bad.ok && bad.error.field === 'localPort')
  assert.equal(parseRemoteSpec({ remotePort: 1, localPort: 1, localHost: 'a b' }).ok, false)
  ok('parseRemoteSpec')
}
{
  assert.equal(remoteForwardBlockReason('L', 'readonly', false), null)
  assert.equal(remoteForwardBlockReason('R', 'readonly', false), 'pfR.blockedReadonly')
  assert.equal(remoteForwardBlockReason('R', 'readonly', true), null)
  assert.equal(remoteForwardBlockReason('R', 'production', false), null)
  ok('read-only blocks -R only, elevation lifts it')
}
{
  assert.equal(exposesBeyondLoopback('127.0.0.1'), false)
  assert.equal(exposesBeyondLoopback('localhost'), false)
  assert.equal(exposesBeyondLoopback('0.0.0.0'), true)
  assert.equal(remoteForwardLabel({ bindAddr: '127.0.0.1', bindPort: 9000, localHost: '127.0.0.1', localPort: 3000 }), '-R 127.0.0.1:9000 → 127.0.0.1:3000')
  ok('labels and exposure')
}
{
  const c = new CarryStore(1000, 2)
  c.put('a', [{ direction: 'R', localPort: 1, remoteHost: 'x', remotePort: 2 }], 0)
  assert.equal(c.take('a', 10).length, 1)
  assert.equal(c.take('a', 10).length, 0, 'take is one-shot')
  c.put('b', [{ direction: 'L', localPort: 1, remoteHost: 'x', remotePort: 2 }], 0)
  assert.equal(c.take('b', 5000).length, 0, 'expired')
  c.put('1', [{ direction: 'L', localPort: 1, remoteHost: 'x', remotePort: 2 }], 0)
  c.put('2', [{ direction: 'L', localPort: 1, remoteHost: 'x', remotePort: 2 }], 0)
  c.put('3', [{ direction: 'L', localPort: 1, remoteHost: 'x', remotePort: 2 }], 0)
  assert.equal(c.size(), 2)
  assert.equal(c.take('1', 1).length, 0, 'oldest evicted')
  ok('CarryStore ttl / one-shot / cap')
}

// ---- fake ssh2 client
class FakeClient extends EventEmitter {
  bound = new Set<number>()
  unbound: number[] = []
  refuse = new Set<number>()
  forwardIn(addr: string, port: number, cb: (err: Error | undefined, port: number) => void) {
    setImmediate(() => {
      if (this.refuse.has(port)) return cb(new Error('remote port forwarding request failed'), 0)
      const p = port === 0 ? 40001 : port
      this.bound.add(p)
      cb(undefined, p)
    })
  }
  unforwardIn(_addr: string, port: number, cb: () => void) {
    this.bound.delete(port)
    this.unbound.push(port)
    cb()
  }
  forwardOut() {
    throw new Error('not used')
  }
  /** Simulates the server opening a channel for an inbound connection; returns the remote-side duplex. */
  inbound(port: number): Duplex | null {
    const toLocal = new PassThrough()
    const fromLocal = new PassThrough()
    const channel = Duplex.from({ readable: toLocal, writable: fromLocal }) as Duplex & { close?: () => void }
    channel.close = () => channel.destroy()
    const remoteSide = Duplex.from({ readable: fromLocal, writable: toLocal })
    remoteSide.on('error', () => undefined)
    channel.on('error', () => undefined)
    let accepted = false
    this.emit('tcp connection', { destIP: '127.0.0.1', destPort: port, srcIP: '10.0.0.9', srcPort: 5555 }, () => {
      accepted = true
      return channel
    }, () => undefined)
    return accepted ? remoteSide : null
  }
}

async function main() {
  const echo = net.createServer((s) => s.on('data', (d) => s.write(Buffer.concat([Buffer.from('echo:'), d]))))
  await new Promise<void>((r) => echo.listen(0, '127.0.0.1', () => r()))
  const echoPort = (echo.address() as net.AddressInfo).port

  const c = new FakeClient()
  const client = c as never

  const f = await startTrackedForward('s1', client, { direction: 'R', remoteHost: '127.0.0.1', remotePort: 9000, localPort: echoPort }, 'manual')
  assert.equal(f.direction, 'R')
  assert.equal(f.status, 'listening')
  assert.equal(f.remotePort, 9000)
  assert.equal(f.localHost, '127.0.0.1')
  ok('forwardIn binds and lists as R')

  const remote = c.inbound(9000)
  assert.ok(remote, 'accepted')
  const reply = await new Promise<string>((resolve) => {
    remote!.once('data', (d: Buffer) => resolve(d.toString()))
    remote!.write('hi')
  })
  assert.equal(reply, 'echo:hi')
  const row = listForwards('s1')[0]!
  assert.equal(row.totalConnections, 1)
  assert.ok(row.bytesIn >= 2 && row.bytesOut >= 7)
  ok('inbound connection reaches local target and counts traffic')

  assert.equal(c.inbound(9999), null, 'unknown port rejected')
  ok('unbound port is rejected')

  await assert.rejects(
    startTrackedForward('s1', client, { direction: 'R', remotePort: 9000, localPort: echoPort }, 'manual'),
    /already forwarded|已在本会话/
  )
  c.refuse.add(9100)
  await assert.rejects(
    startTrackedForward('s1', client, { direction: 'R', remotePort: 9100, localPort: echoPort }, 'manual'),
    /refused|拒绝/
  )
  assert.equal(listForwards('s1').length, 1, 'failed manual forwards are not kept')
  ok('duplicate port and server refusal are reported')

  const auto = await startTrackedForward('s1', client, { direction: 'R', remotePort: 0, localPort: echoPort }, 'manual')
  assert.equal(auto.remotePort, 40001)
  assert.ok(stopForward(auto.id))
  assert.ok(c.unbound.includes(40001))
  ok('port 0 takes the server-assigned port; stop unforwards')

  // L forward too, so carry-over covers both directions
  await startTrackedForward('s1', client, { localPort: 0, remoteHost: '127.0.0.1', remotePort: 5432 }, 'manual')
  await startTrackedForward('s1', client, { direction: 'R', remotePort: 9300, localPort: echoPort }, 'profile')
  assert.equal(stopSessionForwards('s1'), 3)
  assert.equal(listForwards('s1').length, 0)

  const c2 = new FakeClient()
  const roRes = await restoreForwards('s1', 's2', c2 as never, false)
  assert.equal(roRes.restored.length, 1, 'L restored under read-only')
  assert.equal(roRes.skipped.length, 1)
  assert.equal(roRes.skipped[0]!.reason, 'readonly')
  assert.equal(roRes.skipped[0]!.spec.remotePort, 9000)
  assert.ok(!c2.bound.has(9300), 'profile forwards are restored by connect, not carried')
  ok('reconnect restores manual forwards; read-only skips -R with a reason')

  stopSessionForwards('s2')
  const again = await restoreForwards('s2', 's3', c2 as never, true)
  assert.equal(again.restored.length, 1)
  assert.equal((await restoreForwards('s2', 's4', c2 as never, true)).restored.length, 0, 'one-shot')
  ok('carry is one-shot per lost session')

  __resetForwardsForTest()
  echo.close()
  console.log(`\n${passed} passed`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
