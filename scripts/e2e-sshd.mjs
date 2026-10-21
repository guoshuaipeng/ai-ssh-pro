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

const require = createRequire(import.meta.url)
const { Server, utils } = require('ssh2')
const { STATUS_CODE, OPEN_MODE } = utils.sftp

// c58: minimal SFTP subsystem jailed to a temp dir (enough for fastGet/fastPut/readdir/realpath/stat/mkdir)
function attachSftp(sftp, root) {
  const real = (p) => {
    const norm = path.posix.normalize('/' + String(p || '/').replace(/^~\/?/, ''))
    return path.join(root, ...norm.split('/').filter(Boolean))
  }
  const virt = (p) => path.posix.normalize('/' + String(p || '/').replace(/^~\/?/, '').replace(/^\.$/, ''))
  const attrsOf = (st) => ({ mode: st.mode, uid: 0, gid: 0, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) })
  const handles = new Map()
  let next = 1
  const newHandle = (v) => { const b = Buffer.alloc(4); b.writeUInt32BE(next++); handles.set(b.toString('hex'), v); return b }
  const getH = (b) => handles.get(Buffer.from(b).toString('hex'))
  const fail = (id, e) => sftp.status(id, e && e.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE)
  sftp.on('REALPATH', (id, p) => sftp.name(id, [{ filename: virt(p), longname: virt(p), attrs: {} }]))
  const statH = (id, p) => { try { sftp.attrs(id, attrsOf(fs.statSync(real(p)))) } catch (e) { fail(id, e) } }
  sftp.on('STAT', statH)
  sftp.on('LSTAT', statH)
  sftp.on('OPEN', (id, p, flags) => {
    try {
      let mode = 'r'
      if (flags & OPEN_MODE.WRITE) mode = flags & OPEN_MODE.APPEND ? 'a' : flags & OPEN_MODE.READ ? 'r+' : 'w'
      if (mode === 'r+' && !fs.existsSync(real(p))) mode = 'w+'
      sftp.handle(id, newHandle({ fd: fs.openSync(real(p), mode) }))
    } catch (e) { fail(id, e) }
  })
  sftp.on('FSTAT', (id, h) => { const v = getH(h); try { sftp.attrs(id, attrsOf(fs.fstatSync(v.fd))) } catch (e) { fail(id, e) } })
  sftp.on('READ', (id, h, off, len) => {
    const v = getH(h)
    try { const b = Buffer.alloc(len); const n = fs.readSync(v.fd, b, 0, len, off); if (n === 0) sftp.status(id, STATUS_CODE.EOF); else sftp.data(id, b.subarray(0, n)) } catch (e) { fail(id, e) }
  })
  sftp.on('WRITE', (id, h, off, data) => { const v = getH(h); try { fs.writeSync(v.fd, data, 0, data.length, off); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } })
  sftp.on('OPENDIR', (id, p) => { try { sftp.handle(id, newHandle({ dir: real(p), names: fs.readdirSync(real(p)), done: false })) } catch (e) { fail(id, e) } })
  sftp.on('READDIR', (id, h) => {
    const v = getH(h)
    if (!v || v.done) return sftp.status(id, STATUS_CODE.EOF)
    v.done = true
    sftp.name(id, v.names.map((n) => { const st = fs.statSync(path.join(v.dir, n)); return { filename: n, longname: (st.isDirectory() ? 'd' : '-') + 'rw-r--r-- 1 e2e e2e ' + st.size + ' ' + n, attrs: attrsOf(st) } }))
  })
  sftp.on('CLOSE', (id, h) => { const k = Buffer.from(h).toString('hex'); const v = handles.get(k); handles.delete(k); try { if (v && v.fd !== undefined) fs.closeSync(v.fd) } catch {} sftp.status(id, STATUS_CODE.OK) })
  sftp.on('MKDIR', (id, p) => { try { fs.mkdirSync(real(p)); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } })
  for (const ev of ['SETSTAT', 'FSETSTAT']) sftp.on(ev, (id) => sftp.status(id, STATUS_CODE.OK))
  for (const ev of ['REMOVE', 'RMDIR', 'RENAME', 'READLINK', 'SYMLINK']) sftp.on(ev, (id) => sftp.status(id, STATUS_CODE.OP_UNSUPPORTED))
}

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
        session.on('sftp', (accept) => attachSftp(accept(), sftpRoot))
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
