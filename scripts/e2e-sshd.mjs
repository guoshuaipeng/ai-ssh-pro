// c57: loopback-only test sshd for E2E (ssh2 Server). Never reaches a real host.
// Password auth with throwaway test credentials, echo shell, exec exit 0,
// direct-tcpip forwarded only to 127.0.0.1 (the local HTTP echo); c58: SFTP jailed to a temp dir.
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import net from 'node:net'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { serveSftp } from './e2e-sftp-server.mjs'

const require = createRequire(import.meta.url)
const { Server, utils } = require('ssh2')

export const E2E_USER = 'e2e-tester'
export const E2E_PASS = 'e2e-only-not-a-secret'

const listen = (srv) => new Promise((ok, bad) => { srv.once('error', bad); srv.listen(0, '127.0.0.1', () => ok(srv.address().port)) })

// c59: ports the app must listen on later are picked outside the OS ephemeral range
// (Windows 49152+); otherwise a long run's outbound sockets can take the port and listen fails with EACCES.
export async function stablePort() {
  for (let i = 0; i < 50; i++) {
    const p = 20000 + Math.floor(Math.random() * 10000)
    const ok = await new Promise((r) => { const s = net.createServer(); s.once('error', () => r(false)); s.listen(p, '127.0.0.1', () => s.close(() => r(true))) })
    if (ok) return p
  }
  return freePort()
}
export async function freePort() {
  const s = net.createServer()
  const p = await listen(s)
  await new Promise((r) => s.close(r))
  return p
}

export async function startE2eSshd() {
  const sftpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aiss-e2e-sftp-'))
  fs.mkdirSync(path.join(sftpRoot, 'srv'))
  fs.writeFileSync(path.join(sftpRoot, 'srv', 'hello.txt'), 'hello from e2e sftp\n')
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
        session.on('sftp', (accept) => serveSftp(accept(), sftpRoot))
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
    sftpRoot,
    close: () => { try { fs.rmSync(sftpRoot, { recursive: true, force: true }) } catch {}  try { server.close() } catch {} try { echo.close() } catch {} }
  }
}
