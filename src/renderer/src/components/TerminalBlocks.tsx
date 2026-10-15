import { useEffect, useState } from 'react'
import { COMMAND_SUBMITTED_EVENT } from '../lib/ai-events'
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
import Icon, { Twist } from './Icon'
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
  const [ratio, setRatio] = useState(() => loadBlockRatio())
  const [collapsed, setCollapsed] = useState(false)
  const [selected, setSelected] = useState(0)
  useEffect(() => {
    const sync = () => setOn(blocksEnabled())
    window.addEventListener('aiss-blocks', sync)
    return () => window.removeEventListener('aiss-blocks', sync)
  }, [])
  useEffect(() => {
    const toggle = () => setCollapsed((v) => !v)
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
  const height = collapsed ? 24 : blockStripPx(600, ratio).px
  const explain = (b: TermBlock) => {
    window.dispatchEvent(new CustomEvent('aiss-ai-explain', { detail: { sessionId, text: b.output || b.command, source: 'palette' } }))
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
    <div className="term-blocks" data-testid="terminal-blocks" style={{ maxHeight: height, height }}>
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
        <button type="button" onClick={() => setBlocks((cur) => cur.map((b) => ({ ...b, collapsed: true })))}>{tg('blocks.collapseAll')}</button>
        <button type="button" title={collapsed ? tg('blocks.show') : tg('blocks.hide')} onClick={() => setCollapsed((v) => !v)}>{collapsed ? '⌃' : '⌄'}</button>
      </div>
      {collapsed ? null : blocks.map((b, index) => (
        <div
          key={b.id}
          className={`term-block${b.collapsed ? ' is-collapsed' : ''}${index === selected ? ' is-selected' : ''}`}
          tabIndex={0}
          onClick={() => setSelected(index)}
          onKeyDown={(e) => {
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
            <button type="button" title={tg('m2.explain')} aria-label={tg('m2.explain')} onClick={() => explain(b)}><Icon name="sparkles" size={14} /></button>
            <button type="button" onClick={() => void navigator.clipboard.writeText(snippetFromBlock(b).body)}>{tg('m2.copy')}</button>
            <button type="button" onClick={() => saveSnippet(b)}>{tg('m2.saveSnippet')}</button>
          </div>
          {b.collapsed ? null : <pre>{b.large ? b.output.slice(0, 4000) : b.output}</pre>}
        </div>
      ))}
    </div>
  )
}
