/**
 * W9: shipped read-only snippet templates and sample playbooks.
 * Opening a template does not run a remote command. 「另存为」 copies into the user library.
 */
import type { CommandSnippet } from './ipc'
import {
  isBuiltinPlaybookId,
  samplePlaybooks,
  saveAsPlaybook,
  type Playbook
} from './playbook'

export const BUILTIN_SNIPPET_PREFIX = 'builtin:snip:'

export type BuiltinSnippet = CommandSnippet & {
  summary: string
  builtin: true
}

/** Chinese-first labels. Bodies are read-only diagnostics — no secrets, no writes. */
export const BUILTIN_SNIPPETS: readonly BuiltinSnippet[] = [
  {
    id: 'builtin:snip:disk',
    title: '查看磁盘',
    summary: '只读查看挂载占用，不删除文件',
    body: 'df -h',
    builtin: true
  },
  {
    id: 'builtin:snip:mem',
    title: '查看内存',
    summary: '只读查看内存与交换分区',
    body: 'free -h',
    builtin: true
  },
  {
    id: 'builtin:snip:listen',
    title: '查看监听端口',
    summary: '只读列出监听中的套接字',
    body: 'ss -lntup || netstat -lntup',
    builtin: true
  }
]

export type LibrarySeg = 'all' | 'builtin' | 'mine'

export function isBuiltinSnippetId(id: string): boolean {
  return id.startsWith(BUILTIN_SNIPPET_PREFIX)
}

export function builtinSnippetById(id: string): BuiltinSnippet | undefined {
  return BUILTIN_SNIPPETS.find((row) => row.id === id)
}

export function stripBuiltinSnippets<T extends { id: string }>(list: readonly T[]): T[] {
  return list.filter((row) => !isBuiltinSnippetId(row.id))
}

/** User-library copy. The built-in id is never reused, and the source object is not mutated. */
export function saveAsSnippet(source: Pick<BuiltinSnippet, 'title' | 'body'>, makeId: () => string, title?: string): CommandSnippet {
  const name = (title?.trim() || `${source.title} 副本`).slice(0, 120)
  return { id: makeId(), title: name, body: source.body }
}

export function builtinPlaybooks(now = Date.now()): Playbook[] {
  return samplePlaybooks(now).map((playbook) => ({ ...playbook, builtin: true, sample: true }))
}

export function librarySeg<T extends { builtin?: boolean }>(rows: readonly T[], seg: LibrarySeg): T[] {
  if (seg === 'builtin') return rows.filter((row) => row.builtin)
  if (seg === 'mine') return rows.filter((row) => !row.builtin)
  return [...rows]
}

/** Preview / open never starts a remote command and never skips a confirm gate. */
export function builtinOpenPlan(): { remote: false; skipsConfirm: false; runs: false } {
  return { remote: false, skipsConfirm: false, runs: false }
}

export function builtinPlaybookById(id: string, now = Date.now()): Playbook | null {
  if (!isBuiltinPlaybookId(id)) return null
  return builtinPlaybooks(now).find((playbook) => playbook.id === id) ?? null
}

export { saveAsPlaybook }
