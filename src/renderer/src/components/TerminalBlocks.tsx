import { useEffect, useState } from 'react'
import { COMMAND_SUBMITTED_EVENT } from '../lib/ai-events'
import {
  appendBlockOutput,
  blocksEnabled,
  disableBlocksKeepsScrollback,
  setBlocksEnabled,
  snippetFromBlock,
  startBlock,
  toggleBlock,
  type TermBlock
} from '@shared/terminal-blocks'
import { tg } from '../lib/i18n'
import { showToast } from '../lib/toast'

export function blocksAreOn(): boolean {
  return blocksEnabled()
}

export function turnBlocks(on: boolean): boolean {
  if (!on) disableBlocksKeepsScrollback()
  setBlocksEnabled(on)
  if (!on) showToast(tg('m2.blocksOff'))
  window.dispatchEvent(new Event('aiss-blocks'))
  return on
}

export default function TerminalBlocks({ sessionId }: { sessionId: string | null }) {
  const [on, setOn] = useState(() => blocksEnabled())
  const [blocks, setBlocks] = useState<TermBlock[]>([])
  useEffect(() => {
    const sync = () => setOn(blocksEnabled())
    window.addEventListener('aiss-blocks', sync)
    return () => window.removeEventListener('aiss-blocks', sync)
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
      setBlocks((cur) => appendBlockOutput(cur, detail.text))
    }
    window.addEventListener(COMMAND_SUBMITTED_EVENT, onCmd)
    window.addEventListener('aiss-term-chunk', onChunk)
    return () => {
      window.removeEventListener(COMMAND_SUBMITTED_EVENT, onCmd)
      window.removeEventListener('aiss-term-chunk', onChunk)
    }
  }, [on, sessionId])
  if (!on || !sessionId || blocks.length === 0) return null
  const explain = (b: TermBlock) => {
    window.dispatchEvent(new CustomEvent('aiss-ai-explain', { detail: { sessionId, text: b.output || b.command, source: 'palette' } }))
  }
  const saveSnippet = (b: TermBlock) => {
    const snip = snippetFromBlock(b)
    void window.aiss.snippets
      .list()
      .then((list) =>
        window.aiss.snippets.save([
          ...list,
          { id: `blk-${Date.now().toString(36)}`, title: snip.title, body: snip.body }
        ])
      )
      .then(() => showToast(tg('m2.savedSnippet')))
      .catch(() => showToast(tg('m2.snippetFail')))
  }
  return (
    <div className="term-blocks" data-testid="terminal-blocks">
      {blocks.map((b) => (
        <div
          key={b.id}
          className={`term-block${b.collapsed ? ' is-collapsed' : ''}`}
          tabIndex={0}
          onKeyDown={(e) => {
            if (!(e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey)) return
            if (e.key.toLowerCase() !== 'e') return
            e.preventDefault()
            e.stopPropagation()
            explain(b)
          }}
        >
          <div className="term-block-bar">
            <button type="button" onClick={() => setBlocks((cur) => toggleBlock(cur, b.id))}>{b.collapsed ? '▸' : '▾'}</button>
            <code>{b.command}</code>
            <button type="button" title={tg('m2.explain')} onClick={() => explain(b)}>✨</button>
            <button type="button" onClick={() => void navigator.clipboard.writeText(snippetFromBlock(b).body)}>{tg('m2.copy')}</button>
            <button type="button" onClick={() => saveSnippet(b)}>{tg('m2.saveSnippet')}</button>
          </div>
          {b.collapsed ? null : <pre>{b.large ? b.output.slice(0, 4000) : b.output}</pre>}
        </div>
      ))}
    </div>
  )
}
