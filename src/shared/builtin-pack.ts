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

/** zh-CN first, English second — pick with pickBi / localizeBuiltin. */
export type BiText = readonly [zh: string, en: string]

export type BuiltinSnippet = {
  id: string
  title: BiText
  summary: BiText
  body: string
  builtin: true
}

export type LocalizedBuiltinSnippet = CommandSnippet & {
  summary: string
  builtin: true
}

export function pickBi(text: BiText, locale: string): string {
  return /^en\b/i.test(locale) ? text[1] : text[0]
}

export function localizeBuiltin(s: BuiltinSnippet, locale: string): LocalizedBuiltinSnippet {
  return {
    id: s.id,
    title: pickBi(s.title, locale),
    summary: pickBi(s.summary, locale),
    body: s.body,
    builtin: true
  }
}

/** Bilingual labels. Bodies are read-only diagnostics — no secrets, no writes. */
export const BUILTIN_SNIPPETS: readonly BuiltinSnippet[] = [
  {
    id: 'builtin:snip:disk',
    title: ['查看磁盘', 'Check disk'],
    summary: ['只读查看挂载占用，不删除文件', 'Read-only mount usage; does not delete files'],
    body: 'df -h',
    builtin: true
  },
  {
    id: 'builtin:snip:mem',
    title: ['查看内存', 'Check memory'],
    summary: ['只读查看内存与交换分区', 'Read-only memory and swap'],
    body: 'free -h',
    builtin: true
  },
  {
    id: 'builtin:snip:listen',
    title: ['查看监听端口', 'Listening ports'],
    summary: ['只读列出监听中的套接字', 'Read-only list of listening sockets'],
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
export function saveAsSnippet(
  source: { title: BiText | string; body: string },
  makeId: () => string,
  title?: string,
  locale = 'zh-CN'
): CommandSnippet {
  const base = typeof source.title === 'string' ? source.title : pickBi(source.title, locale)
  const suffix = /^en\b/i.test(locale) ? ' copy' : ' 副本'
  const name = (title?.trim() || `${base}${suffix}`).slice(0, 120)
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
