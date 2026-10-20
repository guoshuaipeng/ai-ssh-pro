import { useEffect, useMemo, useRef, useState } from 'react'
import { hitsPerSession, searchSessions, SEARCH_ALL_MIN, SEARCH_ALL_CAP, type TermSource } from '@shared/term-search-all'
import { readTermBuffers } from '../lib/term-buffers'
import { tg } from '../lib/i18n'
import Modal from './Modal'

type Props = {
  open: boolean
  onClose: () => void
  labelFor: (sessionId: string) => string | null
  onPick: (sessionId: string, query: string) => void
}

/** D60: one search over the scrollback of all open terminal tabs; picking a hit jumps to that tab's find bar. */
export default function SearchAllTermsModal({ open, onClose, labelFor, onPick }: Props) {
  const [query, setQuery] = useState('')
  const [sel, setSel] = useState(0)
  const [sources, setSources] = useState<TermSource[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    // snapshot buffers when opened
    const list: TermSource[] = []
    for (const b of readTermBuffers()) {
      const label = labelFor(b.sessionId)
      if (label) list.push({ sessionId: b.sessionId, label, lines: b.lines })
    }
    setSources(list)
    setSel(0)
    window.setTimeout(() => inputRef.current?.select(), 0)
  }, [open, labelFor])
  const hits = useMemo(() => searchSessions(sources, query), [sources, query])
  const per = useMemo(() => hitsPerSession(hits), [hits])
  const pick = (i: number) => {
    const h = hits[i]
    if (!h) return
    onPick(h.sessionId, query.trim())
    onClose()
  }
  return (
    <Modal open={open} title={tg('d60.title')} onClose={onClose} width={640} testId="search-all-terms">
      <input
        ref={inputRef}
        className="search-all-input"
        data-testid="search-all-input"
        value={query}
        placeholder={tg('d60.placeholder', { n: sources.length })}
        aria-label={tg('d60.title')}
        onChange={(e) => {
          setQuery(e.target.value)
          setSel(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSel((s) => Math.min(hits.length - 1, s + 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSel((s) => Math.max(0, s - 1))
          } else if (e.key === 'Enter') {
            e.preventDefault()
            pick(sel)
          }
        }}
      />
      <p className="search-all-summary" data-testid="search-all-summary">
        {query.trim().length < SEARCH_ALL_MIN
          ? tg('d60.hint', { n: SEARCH_ALL_MIN })
          : hits.length
            ? tg(hits.length >= SEARCH_ALL_CAP ? 'd60.countCapped' : 'd60.count', { n: hits.length, tabs: per.size })
            : tg('d60.none')}
      </p>
      <ul className="search-all-list" role="listbox" aria-label={tg('d60.title')}>
        {hits.map((h, i) => (
          <li key={`${h.sessionId}:${h.row}`} role="option" aria-selected={i === sel}>
            <button type="button" className={i === sel ? 'search-all-hit is-sel' : 'search-all-hit'} onMouseEnter={() => setSel(i)} onClick={() => pick(i)}>
              <span className="search-all-tab">{h.label}</span>
              <code className="search-all-text">{h.text}</code>
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
