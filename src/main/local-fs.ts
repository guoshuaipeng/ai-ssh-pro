import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { app, shell } from 'electron'
import type { SftpListEntry, SftpListResult } from '../shared/ipc'

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
