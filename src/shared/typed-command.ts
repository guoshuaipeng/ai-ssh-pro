import { extractPromptCommand } from './smart-complete'

/**
 * D10: the command the user just ran by pressing Enter in the terminal (for command blocks).
 * Only a lone Enter at a recognisable prompt counts; full-screen apps (alternate buffer) and empty lines do not.
 */
export function typedCommandOnEnter(data: string, lineBeforeCursor: string, altScreen: boolean): string | null {
  if (data !== '\r' || altScreen) return null
  const bash = /[\w.-]+@[\w.-]+:[^\s$#]*[$#]\s?(.*)$/.exec(String(lineBeforeCursor ?? ''))
  const cmd = (bash ? bash[1] : extractPromptCommand(lineBeforeCursor))?.trim()
  if (!cmd || cmd.length > 2000) return null
  return cmd
}

/** D9: remote target for files dropped on a terminal: its cwd, else home. */
export function dropTargetDir(cwd: string | null | undefined): string {
  const c = String(cwd ?? '').trim()
  return c.startsWith('/') || c === '~' || c.startsWith('~/') ? c : '~'
}

/** Resolve `~` / `~/x` against the SFTP home directory. */
export function resolveHomePath(dir: string, home: string | null): string | null {
  if (dir.startsWith('/')) return dir
  if (!home) return null
  const h = home.replace(/\/+$/, '') || '/'
  if (dir === '~') return h
  return `${h === '/' ? '' : h}/${dir.slice(2)}`
}

/** D9: transfers that "Retry all" picks up. */
export function retryableTransfers<T extends { status: string }>(tasks: T[]): T[] {
  return tasks.filter((t) => t.status === 'error' || t.status === 'interrupted')
}
