// c57: loopback-only test sshd for E2E (ssh2 Server). Never reaches a real host.
// Password auth with throwaway test credentials, echo shell, exec exit 0,
// direct-tcpip forwarded only to 127.0.0.1 (the local HTTP echo).
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import net from 'node:net'
import http from 'node:http'

const require = createRequire(import.meta.url)
const { Server, utils } = require('ssh2')

export const E2E_USER = 'e2e-tester'
export const E2E_PASS = 'e2e-only-not-a-secret'

const listen = (srv) => new Promise((ok, bad) => { srv.once('error', bad); srv.listen(0, '127.0.0.1', () => ok(srv.address().port)) })

export async function freePort() {
  const s = net.createServer()
  const p = await listen(s)
  await new Promise((r) => s.close(r))
  return p
}

export async function startE2eSshd() {
  const echo = http.createServer((q, r) => {
    r.writeHead(200, { 'content-type': 'text/plain', 'access-control-allow-origin': '*' })
    r.end('aiss-echo:' + q.url)
  })
  const echoPort = await listen(echo)
  const kp = utils.generateKeyPairSync('ed25519')
  const pub = utils.parseKey(kp.public).getPublicSSH()
  const server = new Server({ hostKeys: [kp.private] }, (client) => {
    client.on('error', () => {})
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.username === E2E_USER && ctx.password === E2E_PASS) ctx.accept()
      else ctx.reject(['password'])
    })
    client.on('ready', () => {
      client.on('session', (accept) => {
        const session = accept()
        for (const ev of ['pty', 'env', 'window-change', 'auth-agent', 'x11', 'signal']) session.on(ev, (a) => (typeof a === 'function' ? a() : undefined))
        session.on('shell', (a) => {
          const st = a()
          st.write('e2e-sshd ready\r\n$ ')
          st.on('data', (d) => st.write(d))
        })
        session.on('exec', (a) => { const st = a(); st.exit(0); st.end() })
        session.on('sftp', (_a, reject) => reject && reject())
      })
      client.on('tcpip', (accept, reject, info) => {
        if (info.destIP !== '127.0.0.1' && info.destIP !== 'localhost') return reject()
        const sock = net.connect(info.destPort, '127.0.0.1')
        sock.once('connect', () => { const ch = accept(); sock.pipe(ch).pipe(sock); ch.on('error', () => sock.destroy()) })
        sock.once('error', () => reject())
      })
    })
  })
  const port = await listen(server)
  return {
    port,
    echoPort,
    hostKeyBase64: pub.toString('base64'),
    fingerprint: 'SHA256:' + createHash('sha256').update(pub).digest('base64').replace(/=+$/, ''),
    close: () => { try { server.close() } catch {} try { echo.close() } catch {} }
  }
}
