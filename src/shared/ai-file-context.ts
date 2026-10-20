/** D39: hand a small remote text file to the AI composer: redacted, size-capped, never sent without the user. */
import { redactAuditText } from './audit-log'
import { openDecision } from './sftp-open'

export const AI_FILE_MAX_BYTES = 32 * 1024

const SECRET_FILE = /(^|\/)(id_[a-z0-9]+|[^/]*\.(pem|key|p12|pfx|kdbx|keystore|jks)|shadow|gshadow|\.env(\.[^/]*)?|\.netrc|\.pgpass|credentials)$/i
const SECRET_LINE = /^(\s*(?:export\s+)?[\w.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key)[\w.-]*\s*[:=]\s*)(.+)$/gim

export type AttachCheck = { ok: true } | { ok: false; reason: 'secret' | 'binary' | 'large' }

export function canAttachFile(path: string, size: number): AttachCheck {
  if (SECRET_FILE.test(String(path ?? ''))) return { ok: false, reason: 'secret' }
  const how = openDecision(path, size)
  if (how === 'binary') return { ok: false, reason: 'binary' }
  if (how === 'large') return { ok: false, reason: 'large' }
  return { ok: true }
}

export function buildFileContext(path: string, content: string, truncated: boolean): { text: string; redacted: number } {
  let n = 0
  let out = String(content ?? '').replace(SECRET_LINE, (_m, head: string) => {
    n++
    return `${head}••••`
  })
  const before = out
  out = redactAuditText(out)
  if (out !== before) n += (out.match(/••••/g)?.length ?? 0) - (before.match(/••••/g)?.length ?? 0)
  const note = truncated ? `\n… (only the first ${Math.round(AI_FILE_MAX_BYTES / 1024)} KB)` : ''
  return { text: `# ${path}\n${out}${note}`, redacted: Math.max(0, n) }
}
