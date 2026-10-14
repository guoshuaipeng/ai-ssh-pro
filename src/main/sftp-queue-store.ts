import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { hydrateQueue, type TransferTask } from '../shared/sftp-queue'

function file(): string {
  return join(app.getPath('userData'), 'sftp-queue.json')
}

export function loadSftpQueue(): TransferTask[] {
  try {
    const raw = readFileSync(file(), 'utf8')
    return hydrateQueue(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveSftpQueue(tasks: unknown): TransferTask[] {
  const next = hydrateQueue(tasks)
  const path = file()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(next), 'utf8')
  return next
}
