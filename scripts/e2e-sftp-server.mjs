// Shared SFTP subsystem for the loopback test servers (scripts/e2e.mjs and scripts/e2e-sshd.mjs).
// Backed by a temp dir: "/" on the server == sftpRoot. Test-only; never reaches a real host.
import { mkdirSync, readdirSync, statSync, fstatSync, openSync, readSync, writeSync, closeSync, unlinkSync, rmdirSync, renameSync } from 'node:fs'
import { join, posix } from 'node:path'
import { createRequire } from 'node:module'

const { utils } = createRequire(import.meta.url)('ssh2')
const { STATUS_CODE, flagsToString } = utils.sftp
const attrsOf = (st) => ({ mode: st.mode, uid: 0, gid: 0, size: st.size, atime: Math.floor(st.atimeMs / 1000), mtime: Math.floor(st.mtimeMs / 1000) })
export function serveSftp(sftp, sftpRoot) {
  // jail: "/" on the server is sftpRoot; posix.normalize drops any ".." above it
  const toLocal = (rp) => join(sftpRoot, posix.normalize('/' + String(rp || '')).replace(/^\/+/, ''))
  const handles = new Map()
  let seq = 0
  const mk = (o) => { const b = Buffer.alloc(4); b.writeUInt32BE(++seq); handles.set(seq, o); return b }
  const get = (h) => handles.get(h.readUInt32BE(0))
  const fail = (id, e) => sftp.status(id, e?.code === 'ENOENT' ? STATUS_CODE.NO_SUCH_FILE : STATUS_CODE.FAILURE, String(e?.message || e))
  const ok = (id, fn) => { try { fn(); sftp.status(id, STATUS_CODE.OK) } catch (e) { fail(id, e) } }
  sftp.on('REALPATH', (id, rp) => { const n = posix.normalize('/' + (rp === '.' ? '' : rp)); sftp.name(id, [{ filename: n, longname: n, attrs: {} }]) })
  for (const ev of ['STAT', 'LSTAT']) sftp.on(ev, (id, rp) => { try { sftp.attrs(id, attrsOf(statSync(toLocal(rp)))) } catch (e) { fail(id, e) } })
  sftp.on('FSTAT', (id, h) => { try { sftp.attrs(id, attrsOf(fstatSync(get(h).fd))) } catch (e) { fail(id, e) } })
  sftp.on('OPENDIR', (id, rp) => {
    try { const d = toLocal(rp); if (!statSync(d).isDirectory()) throw new Error('not a directory'); sftp.handle(id, mk({ dir: d, done: false })) } catch (e) { fail(id, e) }
  })
  sftp.on('READDIR', (id, h) => {
    const o = get(h)
    if (!o || o.done) return sftp.status(id, STATUS_CODE.EOF)
    o.done = true
    const names = readdirSync(o.dir).map((n) => {
      const st = statSync(join(o.dir, n))
      return { filename: n, longname: (st.isDirectory() ? 'd' : '-') + 'rw-r--r-- 1 e2e e2e ' + st.size + ' Jan 1 00:00 ' + n, attrs: attrsOf(st) }
    })
    if (!names.length) return sftp.status(id, STATUS_CODE.EOF)
    sftp.name(id, names)
  })
  sftp.on('OPEN', (id, rp, flags) => { try { sftp.handle(id, mk({ fd: openSync(toLocal(rp), flagsToString(flags)) })) } catch (e) { fail(id, e) } })
  sftp.on('READ', (id, h, off, len) => {
    try { const b = Buffer.alloc(len); const n = readSync(get(h).fd, b, 0, len, off); if (n === 0) return sftp.status(id, STATUS_CODE.EOF); sftp.data(id, b.subarray(0, n)) } catch (e) { fail(id, e) }
  })
  sftp.on('WRITE', (id, h, off, data) => ok(id, () => writeSync(get(h).fd, data, 0, data.length, off)))
  sftp.on('CLOSE', (id, h) => { const o = get(h); handles.delete(h.readUInt32BE(0)); try { if (o?.fd != null) closeSync(o.fd) } catch {} sftp.status(id, STATUS_CODE.OK) })
  sftp.on('MKDIR', (id, rp) => ok(id, () => mkdirSync(toLocal(rp))))
  sftp.on('REMOVE', (id, rp) => ok(id, () => unlinkSync(toLocal(rp))))
  sftp.on('RMDIR', (id, rp) => ok(id, () => rmdirSync(toLocal(rp))))
  sftp.on('RENAME', (id, a, b) => ok(id, () => renameSync(toLocal(a), toLocal(b))))
  sftp.on('SETSTAT', (id) => sftp.status(id, STATUS_CODE.OK))
  sftp.on('FSETSTAT', (id) => sftp.status(id, STATUS_CODE.OK))
}
