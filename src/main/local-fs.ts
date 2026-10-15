import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, createReadStream, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { app, shell } from 'electron'
import type { SftpListEntry, SftpListResult } from '../shared/ipc'
import { drivesFromMounts, drivesFromWinDisks, parseProcMounts, type LocalDrive, type LocalDriveListing } from '../shared/local-drives'

export function localHome(): string {
  return homedir()
}

export function listLocal(dir: string): SftpListResult {
  const path = dir && existsSync(dir) ? dir : homedir()
  let names: string[] = []
  try {
    names = readdirSync(path)
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e))
    throw new Error(`没有权限：${path} (${err.message})`)
  }
  const entries: SftpListEntry[] = []
  for (const name of names) {
    if (!name || name === '.' || name === '..') continue
    const full = join(path, name)
    try {
      const st = statSync(full)
      entries.push({
        name,
        path: full,
        isDirectory: st.isDirectory(),
        size: st.isDirectory() ? 0 : st.size,
        modifyTime: st.mtimeMs,
        mode: st.mode
      })
    } catch {
      entries.push({ name, path: full, isDirectory: false, size: 0 })
    }
  }
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })
  return { path, entries }
}

function probeWindowsDriveLetters(): LocalDrive[] {
  const out: LocalDrive[] = []
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code)
    const root = `${letter}:\\`
    try {
      if (!existsSync(root)) continue
      statSync(root)
      out.push({ id: `${letter}:`, root, label: `${letter}:`, ready: true })
    } catch {
      out.push({ id: `${letter}:`, root, label: `${letter}:`, ready: false })
    }
  }
  return out
}

function readWindowsDisks(): LocalDrive[] {
  try {
    const out = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance -ClassName Win32_LogicalDisk | Select-Object DeviceID,VolumeName,Size,FreeSpace | ConvertTo-Json -Compress'
      ],
      { timeout: 2500, encoding: 'utf8', windowsHide: true }
    )
    const parsed = drivesFromWinDisks(JSON.parse(out))
    return parsed
  } catch {
    return []
  }
}

function listPosixDrives(): LocalDrive[] {
  const home = homedir()
  let text = ''
  try {
    text = readFileSync('/proc/mounts', 'utf8')
  } catch {
    text = ''
  }
  const mounts = parseProcMounts(text)
  if (process.platform === 'darwin') {
    try {
      for (const name of readdirSync('/Volumes')) {
        if (!name || name.startsWith('.')) continue
        mounts.push(`/Volumes/${name}`)
      }
    } catch {
      /* no /Volumes */
    }
  }
  return drivesFromMounts(mounts, home).map((d) => {
    if (d.id === '/' || d.id === '~') return d
    try {
      if (!existsSync(d.root)) return { ...d, ready: false }
      statSync(d.root)
      return d
    } catch {
      return { ...d, ready: false }
    }
  })
}

/** Windows letters (including not-ready volumes) or `/`, `~`, and external mounts. */
export function listDrives(): LocalDriveListing {
  if (process.platform === 'win32') {
    const fromPs = readWindowsDisks()
    return { platform: 'win32', drives: fromPs.length ? fromPs : probeWindowsDriveLetters() }
  }
  return { platform: 'posix', drives: listPosixDrives() }
}

export function statLocal(target: string): { size: number; mtime: number; isDirectory: boolean } | null {
  try {
    if (!existsSync(target)) return null
    const st = statSync(target)
    return { size: st.size, mtime: st.mtimeMs, isDirectory: st.isDirectory() }
  } catch {
    return null
  }
}

export function mkdirLocal(target: string): void {
  mkdirSync(target, { recursive: true })
}

export function renameLocal(from: string, to: string): void {
  renameSync(from, to)
}

const trashBook = new Map<string, { original: string; staged: string }>()

function trashDir(): string {
  const dir = join(app.getPath('userData'), 'sftp-trash')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Move a local path aside so the UI can undo from a toast. Falls back to the OS trash. */
export async function trashLocal(target: string): Promise<{ token: string }> {
  const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const staged = join(trashDir(), `${token}-${basename(target)}`)
  try {
    renameSync(target, staged)
    trashBook.set(token, { original: target, staged })
    return { token }
  } catch {
    await shell.trashItem(target)
    return { token: '' }
  }
}

export function restoreTrash(token: string): boolean {
  const row = trashBook.get(token)
  if (!row) return false
  mkdirSync(dirname(row.original), { recursive: true })
  renameSync(row.staged, row.original)
  trashBook.delete(token)
  return true
}

export function revealLocal(target: string): void {
  shell.showItemInFolder(target)
}

/** Read up to maxBytes of a local text file. Does not follow into directories. */
export function readLocalText(target: string, maxBytes = 2 * 1024 * 1024): {
  path: string
  content: string
  size: number
  truncated: boolean
  encoding: 'utf-8'
} {
  const st = statSync(target)
  if (st.isDirectory()) throw new Error('not a file')
  const size = st.size
  const take = Math.min(size, Math.max(0, maxBytes))
  const buf = Buffer.alloc(take)
  const fd = openSync(target, 'r')
  try {
    if (take > 0) readSync(fd, buf, 0, take, 0)
  } finally {
    closeSync(fd)
  }
  return { path: target, content: buf.toString('utf8'), size, truncated: size > maxBytes, encoding: 'utf-8' }
}

export function hashLocal(target: string, maxBytes = 32 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    let got = 0
    const rs = createReadStream(target)
    rs.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      got += buf.length
      hash.update(buf)
      if (got >= maxBytes) rs.destroy()
    })
    rs.on('error', reject)
    rs.on('close', () => resolve(hash.digest('hex')))
  })
}
