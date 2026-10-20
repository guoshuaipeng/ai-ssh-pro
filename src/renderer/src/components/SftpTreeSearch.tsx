import { useEffect, useRef, useState } from 'react'
import type { SftpListResult } from '@shared/ipc'
import { searchTree, TREE_LIMITS, type TreeResult } from '@shared/sftp-tree-search'
import { formatBytes } from '@shared/sftp-queue'
import { tg } from '../lib/i18n'
import Modal from './Modal'

type Props = {
  open: boolean
  root: string
  onClose: () => void
  list: (dir: string) => Promise<SftpListResult>
  onPick: (path: string, isDirectory: boolean) => void
}

/** D75: find a file by name under the current remote folder (SFTP listings only). */
export default function SftpTreeSearch({ open, root, onClose, list, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<TreeResult | null>(null)
  const [sel, setSel] = useState(0)
  const sig = useRef({ cancelled: false })
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) {
      sig.current.cancelled = true
      return
    }
    setRes(null)
    setSel(0)
    window.setTimeout(() => inputRef.current?.select(), 0)
  }, [open, root])
  const run = async () => {
    if (!query.trim()) return
    sig.current.cancelled = true
    const s = { cancelled: false }
    sig.current = s
    setBusy(true)
    try {
      const r = await searchTree(root, query, list, TREE_LIMITS, s)
      if (!s.cancelled) {
        setRes(r)
        setSel(0)
      }
    } finally {
      if (!s.cancelled) setBusy(false)
    }
  }
  const pick = (i: number) => {
    const h = res?.hits[i]
    if (!h) return
    onPick(h.path, h.isDirectory)
    onClose()
  }
  return (
    <Modal open={open} title={tg('d75.title')} onClose={onClose} width={620} testId="sftp-tree-search">
      <p className="search-all-summary">{tg('d75.scope', { root, depth: TREE_LIMITS.maxDepth })}</p>
      <input
        ref={inputRef}
        className="search-all-input"
        data-testid="sftp-tree-input"
        value={query}
        placeholder={tg('d75.placeholder')}
        aria-label={tg('d75.title')}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (res && res.hits.length && !busy) pick(sel)
            else void run()
          } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSel((s) => Math.min((res?.hits.length ?? 1) - 1, s + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((s) => Math.max(0, s - 1))
          }
        }}
      />
      <p className="search-all-summary" data-testid="sftp-tree-summary">
        {busy
          ? tg('d75.busy')
          : !res
            ? tg('d75.hint')
            : res.hits.length
              ? tg(res.truncated ? 'd75.countMore' : 'd75.count', { n: res.hits.length, dirs: res.dirs })
              : tg(res.truncated ? 'd75.noneMore' : 'd75.none', { dirs: res.dirs })}
      </p>
      <ul className="search-all-list" role="listbox" aria-label={tg('d75.title')}>
        {(res?.hits ?? []).map((h, i) => (
          <li key={h.path} role="option" aria-selected={i === sel}>
            <button type="button" className={i === sel ? 'search-all-hit is-sel' : 'search-all-hit'} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
              <span className="search-all-tab">{h.isDirectory ? tg('d75.dir') : formatBytes(h.size)}</span>
              <code className="search-all-text">{h.rel}</code>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
