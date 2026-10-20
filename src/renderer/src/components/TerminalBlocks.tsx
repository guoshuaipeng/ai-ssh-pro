import { useEffect, useRef, useState } from 'react'
import { applyExitHits, blockFailed, createBlockExitParser, failedBlockContext } from '@shared/block-exit'
import { blockExitOn, setBlockExitOn } from '../lib/block-wire'
import { aiOrigins } from '../lib/ai-origin'
import { BLOCK_HIST_PREFIX, fromStored, mergeForSave, parseStored, searchBlocks, toStored, type StoredBlock } from '@shared/block-history'
import { isStrictPasteHost } from '../lib/paste-pref'
import { SHELL_EXIT_EVENT, SHELL_INT_EVENT, integrationState, setShellIntOn, shellIntOn } from '../lib/shell-integration'
import { COMMAND_SUBMITTED_EVENT, fillCommandBar } from '../lib/ai-events'
import {
  BLOCK_HEIGHT_DEFAULT,
  appendBlockOutput,
  blockStripPx,
  blocksEnabled,
  disableBlocksKeepsScrollback,
  loadBlockRatio,
  saveBlockRatio,
  setBlocksEnabled,
  snippetFromBlock,
  upsertCommandSnippet,
  startBlock,
  toggleBlock,
  type TermBlock
} from '@shared/terminal-blocks'
import { tg } from '../lib/i18n'
import { blockMatcher, stepMatch } from '@shared/find-scope'
import { BLOCKS_HITS_EVENT, BLOCKS_QUERY_EVENT, BLOCKS_STEP_EVENT, type BlocksQueryDetail, type BlocksStepDetail } from '../lib/find-bridge'
import { AISS_TERMINAL_FIND_EVENT } from '../lib/terminal-find'
import Icon, { Twist } from './Icon'
import { showToast } from '../lib/toast'
import { requestAskWithContext } from '../lib/ai-prefill'

export function blocksAreOn(): boolean {
  return blocksEnabled()
}

export function turnBlocks(on: boolean): boolean {
  if (!on) disableBlocksKeepsScrollback()
  setBlocksEnabled(on)
  showToast(tg(on ? 'm2.blocksOn' : 'm2.blocksOff'))
  window.dispatchEvent(new Event('aiss-blocks'))
  return on
}

export default function TerminalBlocks({ sessionId, hostKey = '' }: { sessionId: string | null; hostKey?: string }) {
  const [on, setOn] = useState(() => blocksEnabled())
  const [blocks, setBlocks] = useState<TermBlock[]>([])
  const [ratio, setRatio] = useState(() => loadBlockRatio())
  const [collapsed, setCollapsed] = useState(false)
  const [selected, setSelected] = useState(0)
  const [exitOn, setExitOn] = useState(() => blockExitOn())
  const parserRef = useRef(createBlockExitParser())
  const stripRef = useRef<HTMLDivElement>(null)
  const [siOn, setSiOn] = useState(() => shellIntOn())
  const [query, setQuery] = useState('')
  const [qOpts, setQOpts] = useState({ caseSensitive: false, regex: false })
  // D19: the query comes from the terminal find bar (Ctrl+F, scope = blocks)
  useEffect(() => {
    const onQuery = (e: Event) => {
      const d = (e as CustomEvent<BlocksQueryDetail>).detail
      if (!d || d.sessionId !== sessionId) return
      setQuery(d.query)
      setQOpts({ caseSensitive: d.caseSensitive, regex: d.regex })
    }
    window.addEventListener(BLOCKS_QUERY_EVENT, onQuery)
    return () => window.removeEventListener(BLOCKS_QUERY_EVENT, onQuery)
  }, [sessionId])
  const matcherOf = (q: string) => {
    const m = blockMatcher(q, qOpts)
    return m === 'error' ? () => false : m
  }
  const blocksRef = useRef<TermBlock[]>([])
  const selectedRef = useRef(0)
  useEffect(() => {
    const onStep = (e: Event) => {
      const d = (e as CustomEvent<BlocksStepDetail>).detail
      if (!d || d.sessionId !== sessionId) return
      const list = searchBlocks(blocksRef.current, query, matcherOf(query))
      const next = stepMatch(list, selectedRef.current, d.back)
      if (next < 0) return
      setSelected(next)
      window.setTimeout(() => stripRef.current?.querySelector(`[data-block-index="${next}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
    }
    window.addEventListener(BLOCKS_STEP_EVENT, onStep)
    return () => window.removeEventListener(BLOCKS_STEP_EVENT, onStep)
  })
  const histRef = useRef<StoredBlock[]>([])
  // D17: restore this host's recent blocks (local only; never for production / read-only hosts)
  useEffect(() => {
    histRef.current = []
    if (!on || !sessionId || !hostKey || isStrictPasteHost(hostKey)) return
    let list: StoredBlock[] = []
    try {
      list = parseStored(localStorage.getItem(BLOCK_HIST_PREFIX + hostKey))
    } catch {
      list = []
    }
    histRef.current = list
    if (list.length) setBlocks((cur) => (cur.length ? cur : fromStored(list)))
  }, [on, sessionId, hostKey])
  useEffect(() => {
    if (!on || !hostKey || isStrictPasteHost(hostKey)) return
    const live = blocks.filter((b) => !(b as { restored?: boolean }).restored)
    if (!live.some((b) => !b.running)) return
    const id = window.setTimeout(() => {
      try {
        localStorage.setItem(BLOCK_HIST_PREFIX + hostKey, JSON.stringify(mergeForSave(histRef.current, toStored(live))))
      } catch {
        /* quota: history is best effort */
      }
    }, 800)
    return () => window.clearTimeout(id)
  }, [blocks, on, hostKey])
  const clearHistory = () => {
    try {
      localStorage.removeItem(BLOCK_HIST_PREFIX + hostKey)
    } catch {
      /* ignore */
    }
    histRef.current = []
    setBlocks((cur) => cur.filter((b) => !(b as { restored?: boolean }).restored))
    showToast(tg('d17.cleared'))
  }
  useEffect(() => {
    const sync = () => setOn(blocksEnabled())
    window.addEventListener('aiss-blocks', sync)
    return () => window.removeEventListener('aiss-blocks', sync)
  }, [])
  useEffect(() => {
    const toggle = () =>
      setCollapsed((v) => {
        const next = !v
        showToast(tg(next ? 'blocks.hide' : 'blocks.show'))
        return next
      })
    window.addEventListener('aiss-toggle-block-strip', toggle)
    return () => window.removeEventListener('aiss-toggle-block-strip', toggle)
  }, [])
  useEffect(() => {
    if (!on || !sessionId) return
    const onCmd = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId: string; command: string }>).detail
      if (!detail || detail.sessionId !== sessionId) return
      setBlocks((cur) => startBlock(cur, detail.command))
    }
    const onChunk = (e: Event) => {
      const detail = (e as CustomEvent<{ sessionId: string; text: string }>).detail
      if (!detail || detail.sessionId !== sessionId) return
      const { clean, hits } = parserRef.current.feed(detail.text)
      setBlocks((cur) => applyExitHits(appendBlockOutput(cur, clean), hits))
    }
    // D14: Shell Integration reports $? before each new prompt, typed commands included
    const onShellExit = (e: Event) => {
      const d = (e as CustomEvent<{ sessionId: string; code: number }>).detail
      if (!d || d.sessionId !== sessionId) return
      setBlocks((cur) => applyExitHits(cur, [{ nonce: 'si', code: d.code }]))
    }
    // D15: Ctrl+Up / Ctrl+Down in the terminal selects the same block here
    const onSelect = (e: Event) => {
      const d = (e as CustomEvent<{ sessionId: string; fromEnd: number }>).detail
      if (!d || d.sessionId !== sessionId) return
      setBlocks((cur) => {
        const i = cur.length - 1 - d.fromEnd
        if (i >= 0) {
          setSelected(i)
          window.setTimeout(() => stripRef.current?.querySelectorAll('.term-block')[i]?.scrollIntoView({ block: 'nearest' }), 0)
        }
        return cur
      })
    }
    window.addEventListener(COMMAND_SUBMITTED_EVENT, onCmd)
    window.addEventListener('aiss-term-chunk', onChunk)
    window.addEventListener(SHELL_EXIT_EVENT, onShellExit)
    window.addEventListener('aiss-block-select', onSelect)
    return () => {
      window.removeEventListener(COMMAND_SUBMITTED_EVENT, onCmd)
      window.removeEventListener('aiss-term-chunk', onChunk)
      window.removeEventListener(SHELL_EXIT_EVENT, onShellExit)
      window.removeEventListener('aiss-block-select', onSelect)
    }
  }, [on, sessionId])
  useEffect(() => {
    const sync = () => setSiOn(shellIntOn())
    window.addEventListener(SHELL_INT_EVENT, sync)
    return () => window.removeEventListener(SHELL_INT_EVENT, sync)
  }, [])
  blocksRef.current = blocks
  selectedRef.current = selected
  const matchList = searchBlocks(blocks, query, matcherOf(query))
  const pos = matchList.indexOf(selected)
  const hitsKey = `${matchList.length}:${pos}:${query}`
  useEffect(() => {
    if (!sessionId) return
    window.dispatchEvent(new CustomEvent(BLOCKS_HITS_EVENT, { detail: { sessionId, index: pos + 1, total: query.trim() ? matchList.length : 0 } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hitsKey, sessionId])
  if (!on || !sessionId || blocks.length === 0) return null
  const matches = new Set(matchList)
  const height = collapsed ? 24 : blockStripPx(600, ratio).px
  const explain = (b: TermBlock) => {
    window.dispatchEvent(new CustomEvent('aiss-ai-explain', { detail: { sessionId, text: b.output || b.command, source: 'palette' } }))
  }
  // D15: re-run = put it back in this session's command bar; Enter there goes through the usual protection gate
  const rerun = (b: TermBlock) => {
    if (!sessionId || b.running) return
    fillCommandBar(sessionId, b.command)
    showToast(tg('d15.filled'))
  }
  const saveSnippet = (b: TermBlock) => {
    const snip = snippetFromBlock(b)
    void window.aiss.snippets
      .list()
      .then((list) => {
        const next = upsertCommandSnippet(list, snip, `blk-${Date.now().toString(36)}`)
        if (next === list) return
        return window.aiss.snippets.save(next)
      })
      .then(() => showToast(tg('m2.savedSnippet')))
      .catch(() => showToast(tg('m2.snippetFail')))
  }
  return (
    <div ref={stripRef} className="term-blocks" data-testid="terminal-blocks" style={{ maxHeight: height, height }}>
      <div
        className="term-blocks-resize"
        title={tg('blocks.resize')}
        onDoubleClick={() => {
          const next = saveBlockRatio(BLOCK_HEIGHT_DEFAULT)
          setRatio(next)
          setCollapsed(false)
        }}
        onMouseDown={(e) => {
          const startY = e.clientY
          const start = ratio
          const move = (ev: MouseEvent) => {
            const delta = startY - ev.clientY
            const next = saveBlockRatio(start + delta / 600)
            setRatio(next)
            setCollapsed(blockStripPx(600, next).collapsed && delta > 200)
          }
          const up = () => {
            window.removeEventListener('mousemove', move)
            window.removeEventListener('mouseup', up)
          }
          window.addEventListener('mousemove', move)
          window.addEventListener('mouseup', up)
        }}
      />
      <div className="term-blocks-head">
        <span>{tg('blocks.title', { n: blocks.length })}</span>
        {query.trim() ? (
          <button type="button" className="term-blocks-hits" data-testid="blocks-hits" title={tg('d19.chipTip')} onClick={() => window.dispatchEvent(new Event(AISS_TERMINAL_FIND_EVENT))}>
            {tg('d19.chip', { q: query.trim(), n: matches.size })}
          </button>
        ) : (
          <button type="button" className="term-blocks-findbtn" data-testid="blocks-search" title={tg('d19.searchTip')} onClick={() => window.dispatchEvent(new CustomEvent(AISS_TERMINAL_FIND_EVENT, { detail: { scope: 'blocks' } }))}>
            {tg('d17.search')}
          </button>
        )}
        {hostKey && !isStrictPasteHost(hostKey) && blocks.some((b) => (b as { restored?: boolean }).restored) ? (
          <button type="button" data-testid="blocks-clear-history" title={tg('d17.clearTip')} onClick={clearHistory}>{tg('d17.clear')}</button>
        ) : null}
        <label className="term-blocks-exit" title={tg('d14.tip')}>
          <input type="checkbox" data-testid="blocks-shell-int" checked={siOn} onChange={(e) => { const v = e.currentTarget.checked; setShellIntOn(v); setSiOn(v); showToast(tg(v ? 'd14.on' : 'd14.off')) }} />
          {tg('d14.label')}
          {sessionId && integrationState(sessionId) === 'active' ? <span className="term-block-exit is-ok" data-testid="shell-int-active">●</span> : null}
        </label>
        <label className="term-blocks-exit term-blocks-exit2" title={tg('d11.captureTip')}>
          <input type="checkbox" data-testid="blocks-exit-toggle" checked={exitOn} onChange={(e) => { const v = e.currentTarget.checked; setBlockExitOn(v); setExitOn(v) }} />
          {tg('d11.capture')}
        </label>
        <button type="button" onClick={() => setBlocks((cur) => cur.map((b) => ({ ...b, collapsed: true })))}>{tg('blocks.collapseAll')}</button>
        <button type="button" title={collapsed ? tg('blocks.show') : tg('blocks.hide')} onClick={() => setCollapsed((v) => { const next = !v; showToast(tg(next ? 'blocks.hide' : 'blocks.show')); return next })}>{collapsed ? '⌃' : '⌄'}</button>
      </div>
      {collapsed ? null : blocks.map((b, index) => !matches.has(index) ? null : (
        <div
          key={b.id}
          data-block-index={index}
          className={`term-block${(b as { restored?: boolean }).restored ? ' is-restored' : ''}${b.collapsed && !query.trim() ? ' is-collapsed' : ''}${index === selected ? ' is-selected' : ''}`}
          tabIndex={0}
          onClick={() => setSelected(index)}
          onKeyDown={(e) => {
            const plain = !e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey
            // D15: ↑/↓ moves between blocks, Enter puts the command back in the command bar
            if (plain && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
              e.preventDefault()
              const next = Math.max(0, Math.min(blocks.length - 1, index + (e.key === 'ArrowUp' ? -1 : 1)))
              setSelected(next)
              ;(e.currentTarget.parentElement?.querySelectorAll<HTMLElement>('.term-block')[next])?.focus()
              return
            }
            if (plain && e.key === 'Enter' && e.target === e.currentTarget) {
              e.preventDefault()
              rerun(b)
              return
            }
            if (!(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)) return
            if (e.key.toLowerCase() !== 'e') return
            e.preventDefault()
            e.stopPropagation()
            explain(b)
          }}
        >
          <div className="term-block-bar">
            <button type="button" title={tg(b.collapsed ? 'db.expand' : 'db.collapse')} aria-label={tg(b.collapsed ? 'db.expand' : 'db.collapse')} onClick={() => setBlocks((cur) => toggleBlock(cur, b.id))}><Twist open={!b.collapsed} size={12} /></button>
            <code>{b.command}</code>
            {b.running ? (
              <span className="term-block-exit is-running" title={tg('d11.running')}>…</span>
            ) : b.exitCode == null ? (
              <span className="term-block-exit is-none" title={tg('d11.noExit')}>—</span>
            ) : (
              <span className={`term-block-exit ${b.exitCode === 0 ? 'is-ok' : 'is-fail'}`} data-testid="block-exit" title={tg('d11.exitTitle', { code: b.exitCode })}>
                {b.exitCode === 0 ? '✓' : `✗ ${b.exitCode}`}
              </span>
            )}
            {!b.running && sessionId && aiOrigins.has(sessionId, b.command) ? (
              <button type="button" className="term-block-send" data-testid="block-send-ai" title={tg('d16.sendTip')}
                onClick={() => { if (sessionId) requestAskWithContext(sessionId, failedBlockContext(b), b.exitCode == null ? tg('d16.resultQNoCode') : tg('d16.resultQ', { code: b.exitCode })) }}>
                {tg('d16.send')}
              </button>
            ) : null}
            {blockFailed(b) ? (
              <button type="button" className="term-block-why" data-testid="block-why-failed"
                onClick={() => { if (sessionId) requestAskWithContext(sessionId, failedBlockContext(b), tg('d11.whyQ', { code: b.exitCode ?? '' })) }}>
                {tg('d11.why')}
              </button>
            ) : null}
            <button type="button" title={tg('m2.explain')} aria-label={tg('m2.explain')} onClick={() => explain(b)}><Icon name="sparkles" size={14} /></button>
            <button type="button" onClick={() => void navigator.clipboard.writeText(snippetFromBlock(b).body)}>{tg('m2.copy')}</button>
            <button
              type="button"
              data-testid="block-copy-output"
              disabled={!b.output.trim()}
              title={b.output.trim() ? undefined : tg('d10.noOutput')}
              onClick={() => void navigator.clipboard.writeText(b.output).then(() => showToast(tg('d10.copiedOutput')), () => showToast(tg('ai.copyFailed'), { kind: 'error' }))}
            >
              {tg('d10.copyOutput')}
            </button>
            <button
              type="button"
              data-testid="block-ask-ai"
              onClick={() => {
                if (sessionId) requestAskWithContext(sessionId, `$ ${b.command}\n${b.output.slice(-4000)}`)
              }}
            >
              {tg('d10.ask')}
            </button>
            <button type="button" data-testid="block-rerun" title={tg('d15.rerunTip')} onClick={() => rerun(b)}>{tg('d15.rerun')}</button>
            <button type="button" onClick={() => saveSnippet(b)}>{tg('m2.saveSnippet')}</button>
          </div>
          {b.collapsed && !query.trim() ? null : <pre>{b.large ? b.output.slice(0, 4000) : b.output}</pre>}
        </div>
      ))}
    </div>
  )
}
