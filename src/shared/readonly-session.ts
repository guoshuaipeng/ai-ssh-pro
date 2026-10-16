/** S4: session read-only stacked on S2. Stricter level wins. Client-side only. */

import type { ProtectionLevel } from './protection'

const WRITE_WORD =
  /\b(rmdir|rm|unlink|mv|cp|install|ln|mkdir|touch|truncate|chmod|chown|chgrp|tee|killall|pkill|kill|useradd|userdel|usermod|groupadd|groupdel|passwd|visudo|mkfs|dd|shutdown|reboot|halt|poweroff|crontab|umount|mount|iptables|ufw|nft|scp|rsync|unzip|gunzip|vim|vi|nano|emacs)\b/i

const WRITE_PHRASE: RegExp[] = [
  /\bsed\b[^\n]*\s-i(?:\s|$)/,
  /\bperl\b[^\n]*\s-i(?:\s|$)/,
  /\b(?:systemctl|service)\s+(?:start|stop|restart|reload|enable|disable|mask|unmask)\b/i,
  /\b(?:apt-get|apt|yum|dnf|pacman|zypper)\s+(?:install|remove|purge|update|upgrade|erase|autoremove)\b/i,
  /\bpip3?\s+install\b/i,
  /\bnpm\s+(?:install|uninstall|update|ci)\b/i,
  /\bdocker\s+(?:rm|rmi|stop|kill|run|start|restart|exec|compose)\b/i,
  /\bgit\s+(?:commit|push|reset|clean|rebase|checkout|merge|tag)\b/i,
  /\b(?:wget|curl)\b[^\n]*(?:-[Oo]|--output)\b/,
  /\btar\b[^\n]*(?:\s-x|\bx)/,
  /\bfind\b[^\n]*(?:-delete|-exec)\b/,
  /\b(?:drop|truncate|insert|update|delete|alter)\s+(?:database|schema|table|from|into)\b/i
]

export type ShellClass = 'read' | 'write'

export function writeToken(line: string): string {
  const word = WRITE_WORD.exec(line)
  if (word) return word[1]!.toLowerCase()
  if (hasFileRedirect(line)) return '>'
  return 'write'
}

function stripWrappers(line: string): string {
  let s = line.trim()
  s = s.replace(/^\s*#.*$/, '')
  s = s.replace(/\s+#.*$/, '')
  s = s.replace(/^(?:sudo\s+)+/i, '')
  s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '')
  return s.trim()
}

/** File redirect. `2>&1` and `< file` are not writes. */
export function hasFileRedirect(line: string): boolean {
  if (/&>>?/.test(line)) return true
  const stripped = line.replace(/\d*>&\d+/g, '')
  return /(?:^|[^<>&])>>?=?/.test(stripped) && /(?:^|[^<>&=])>>?(?!=)/.test(stripped)
}

export function classifyShellLine(line: string): ShellClass {
  const s = stripWrappers(line)
  if (!s) return 'read'
  if (hasFileRedirect(s)) return 'write'
  if (WRITE_WORD.test(s)) return 'write'
  for (const re of WRITE_PHRASE) if (re.test(s)) return 'write'
  return 'read'
}

export type RoBlock = {
  multiline: boolean
  command: string
  token: string
}

export type TerminalGate = {
  buffer: string
  /** Bytes that may go to the host. Empty when the chunk is blocked. */
  send: string
  /** Ctrl-U after a typed Enter, so the remote line is not left armed. */
  clear: string
  block: RoBlock | null
}

function applyEdit(buffer: string, chunk: string): string {
  let buf = buffer
  for (const ch of chunk) {
    if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1)
    else if (ch === '\u0015') buf = ''
    else if (ch >= ' ' && ch !== '\u0000') buf += ch
  }
  return buf.slice(-400)
}

function splitComplete(text: string): { lines: string[]; rest: string } {
  const norm = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const parts = norm.split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts, rest }
}

/**
 * Intercept before send. A multi-line paste with any write line is dropped
 * as a whole. A detection failure blocks (stricter).
 */
export function gateTerminalChunk(
  buffer: string,
  chunk: string,
  classify: (line: string) => ShellClass = classifyShellLine
): TerminalGate {
  try {
    if (!/[\r\n]/.test(chunk)) {
      return { buffer: applyEdit(buffer, chunk), send: chunk, clear: '', block: null }
    }
    const combined = buffer + chunk
    const { lines, rest } = splitComplete(combined)
    const meaningful = lines.map((s) => s.trim()).filter(Boolean)
    const writes: string[] = []
    for (const line of meaningful) {
      let kind: ShellClass = 'write'
      try {
        kind = classify(line)
      } catch {
        kind = 'write'
      }
      if (kind === 'write') writes.push(line)
    }
    if (writes.length > 0 && meaningful.length > 1) {
      return {
        buffer: '',
        send: '',
        clear: '',
        block: { multiline: true, command: meaningful.join('\n'), token: writeToken(writes[0]!) }
      }
    }
    if (writes.length === 1) {
      const typedEnter = /^[\r\n]+$/.test(chunk)
      return {
        buffer: '',
        send: '',
        clear: typedEnter ? '\u0015' : '',
        block: { multiline: false, command: meaningful[0] ?? writes[0]!, token: writeToken(writes[0]!) }
      }
    }
    return { buffer: applyEdit('', rest), send: chunk, clear: '', block: null }
  } catch {
    return {
      buffer: '',
      send: '',
      clear: '',
      block: { multiline: /[\r\n]/.test(chunk), command: chunk, token: 'write' }
    }
  }
}

/** Profile readonly or a session flag. Production loses to read-only. */
export function stricterLevel(profileLevel: ProtectionLevel, sessionReadonly: boolean): ProtectionLevel {
  if (profileLevel === 'readonly' || sessionReadonly) return 'readonly'
  return profileLevel
}

export function readonlyActive(level: ProtectionLevel, elevated: boolean): boolean {
  return level === 'readonly' && !elevated
}

/** Playbook run stays disabled when every selected host is read-only. Dry-run is separate. */
export function playbookRunDisabled(levels: readonly ProtectionLevel[]): boolean {
  return levels.length > 0 && levels.every((level) => level === 'readonly')
}
