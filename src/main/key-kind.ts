/** Detect a private-key type in the main process. The renderer only receives the kind. */
import { readFileSync } from 'node:fs'
import { detectKeyMaterial, type KeyKind } from '../shared/ssh-cert'

export function detectKeyFileKind(target: string): KeyKind {
  const path = String(target ?? '').trim()
  if (!path) return 'unknown'
  try {
    const text = readFileSync(path, 'utf8').slice(0, 64_000)
    return detectKeyMaterial(text)
  } catch {
    return 'unknown'
  }
}
