# -*- coding: utf-8 -*-
"""R25 item2: working-memory expand UX — touch, collapse, audit jump."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]

# --- shared working-memory-view: add query field ---
wm = ROOT / "src/shared/working-memory-view.ts"
w = wm.read_text(encoding="utf-8")
if "query?: string" not in w:
    w = w.replace(
        """export type MemoryEvidenceItem = {
  kind: MemoryEvidenceKind
  text: string
}
""",
        """export type MemoryEvidenceItem = {
  kind: MemoryEvidenceKind
  text: string
  /** Full (untruncated) text for audit filter / title. */
  query?: string
}
""",
        1,
    )
    old_push = """  const push = (kind: MemoryEvidenceKind, raw: string | null | undefined) => {
    if (items.length >= maxItems) return
    const text = cleanLine(raw, maxChars)
    if (!text) return
    if (items.some((it) => it.text === text)) return
    items.push({ kind, text })
  }
"""
    new_push = """  const push = (kind: MemoryEvidenceKind, raw: string | null | undefined) => {
    if (items.length >= maxItems) return
    const full = (raw ?? '').replace(/\\s+/g, ' ').trim()
    if (!full) return
    const text = cleanLine(full, maxChars)
    if (!text) return
    if (items.some((it) => it.text === text || it.query === full)) return
    items.push({ kind, text, query: full })
  }
"""
    if old_push not in w:
        raise SystemExit("push block missing")
    w = w.replace(old_push, new_push, 1)
    wm.write_text(w, encoding="utf-8")
    print("shared: query field ok")
else:
    print("shared: already")

# --- i18n ---
i18n = ROOT / "src/renderer/src/lib/i18n.tsx"
i = i18n.read_text(encoding="utf-8")
if "'wm.close'" not in i:
    i = i.replace(
        "'wm.emptyEvidence': \"暂无观测证据\",\n",
        "'wm.emptyEvidence': \"暂无观测证据\",\n  'wm.close': \"收起\",\n  'wm.jumpAudit': \"审计\",\n  'wm.jumpAuditTip': \"在审计中按此近令筛选（不会执行命令）\",\n",
        1,
    )
    i = i.replace(
        "'wm.emptyEvidence': \"No observational evidence yet\",\n",
        "'wm.emptyEvidence': \"No observational evidence yet\",\n  'wm.close': \"Collapse\",\n  'wm.jumpAudit': \"Audit\",\n  'wm.jumpAuditTip': \"Filter audit by this recent command (never executes)\",\n",
        1,
    )
    i18n.write_text(i, encoding="utf-8")
    print("i18n: ok")
else:
    print("i18n: already")

# --- AIPanel memory pop ---
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
p = panel.read_text(encoding="utf-8")

# Ensure OpenAuditDetail type import if needed — OPEN_AUDIT_EVENT already imported from ExecReplay
if "type OpenAuditDetail" not in p and "OpenAuditDetail" not in p.split("from './ExecReplay'")[0][-200:]:
    # Use inline detail; no type import required
    pass

old_pop = """                {memoryOpen ? (
                  <div
                    id="ai-memory-pop"
                    className="titlebar-popover ai-memory-pop"
                    role="dialog"
                    data-testid="ai-memory-pop"
                    aria-label={tg('wm.memoryTitle')}
                  >
                    <div className="ai-pop-head">{tg('wm.memoryTitle')}</div>
                    <ul className="ai-memory-list" data-testid="ai-memory-list">
                      {memoryView.items.map((it, idx) => (
                        <li key={`${it.kind}-${idx}`} className="ai-memory-item" data-kind={it.kind} title={it.text}>
                          <span className="ai-memory-kind">
                            {it.kind === 'hostFact'
                              ? tg('wm.hostFact')
                              : it.kind === 'observation'
                                ? tg('wm.observation')
                                : tg('wm.recentCommand')}
                          </span>
                          <span className="ai-memory-text">{it.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
"""

new_pop = """                {memoryOpen ? (
                  <div
                    id="ai-memory-pop"
                    className="titlebar-popover ai-memory-pop"
                    role="dialog"
                    data-testid="ai-memory-pop"
                    aria-label={tg('wm.memoryTitle')}
                  >
                    <div className="ai-pop-head ai-memory-pop-head">
                      <span className="ai-memory-pop-title">{tg('wm.memoryTitle')}</span>
                      <button
                        type="button"
                        className="link-btn ai-memory-close"
                        data-testid="ai-memory-close"
                        aria-label={tg('wm.close')}
                        onClick={() => setMemoryOpen(false)}
                      >
                        {tg('wm.close')}
                      </button>
                    </div>
                    <ul className="ai-memory-list" data-testid="ai-memory-list">
                      {memoryView.items.map((it, idx) => {
                        const canJump = it.kind === 'recentCommand'
                        const full = (it.query || it.text || '').trim()
                        const jump = () => {
                          if (!canJump || !full) return
                          const host = conversation
                            ? conversationLabel(conversation.hostLabel, conversation.n)
                            : hostName || undefined
                          window.dispatchEvent(
                            new CustomEvent(OPEN_AUDIT_EVENT, {
                              detail: { host, source: 'AI', type: 'command', text: full }
                            })
                          )
                          setMemoryOpen(false)
                        }
                        return (
                          <li
                            key={`${it.kind}-${idx}`}
                            className={`ai-memory-item${canJump ? ' is-jumpable' : ''}`}
                            data-kind={it.kind}
                            data-testid={canJump ? 'ai-memory-jump' : 'ai-memory-item'}
                            title={canJump ? tg('wm.jumpAuditTip') : full || it.text}
                          >
                            <span className="ai-memory-kind">
                              {it.kind === 'hostFact'
                                ? tg('wm.hostFact')
                                : it.kind === 'observation'
                                  ? tg('wm.observation')
                                  : tg('wm.recentCommand')}
                            </span>
                            {canJump ? (
                              <button
                                type="button"
                                className="ai-memory-jump-btn"
                                data-testid="ai-memory-jump-btn"
                                title={tg('wm.jumpAuditTip')}
                                onClick={jump}
                              >
                                <span className="ai-memory-text">{it.text}</span>
                                <span className="ai-memory-jump-label">{tg('wm.jumpAudit')}</span>
                              </button>
                            ) : (
                              <span className="ai-memory-text">{it.text}</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                ) : null}
"""

if "ai-memory-close" in p and "ai-memory-jump-btn" in p:
    print("panel: already patched")
elif old_pop not in p:
    raise SystemExit("memory pop block not found")
else:
    p = p.replace(old_pop, new_pop, 1)
    panel.write_text(p, encoding="utf-8")
    print("panel: pop patched")

# --- CSS ---
css_path = ROOT / "src/renderer/src/styles.css"
css = css_path.read_text(encoding="utf-8")
marker = "/* R25 Round25: working-memory expand UX */"
if marker not in css:
    # Update chip padding / min-height in R20 block
    old_chip = """.ai-panel .ai-memory-chip {
  display: inline-flex;
  align-items: baseline;
  gap: var(--space-1);
  min-width: 0;
  max-width: 100%;
  margin: 0;
  padding: 0 var(--space-1);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--fs-xs);
  line-height: 1.3;
  cursor: pointer;
}
"""
    new_chip = """.ai-panel .ai-memory-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
  max-width: 100%;
  min-height: 28px;
  margin: 0;
  padding: var(--space-1) var(--space-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  font-size: var(--fs-xs);
  line-height: 1.3;
  cursor: pointer;
  touch-action: manipulation;
}
"""
    if old_chip not in css:
        raise SystemExit("chip CSS block missing")
    css = css.replace(old_chip, new_chip, 1)
    # Append R25 block after R21 narrow rule (before .ai-header-shortcut)
    insert_at = "/* R21: memory chip ultra-narrow — count only, label via aria-label/title */"
    r25_block = """/* R25 Round25: working-memory expand UX */
.ai-panel .ai-memory-pop-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.ai-panel .ai-memory-pop-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ai-panel .ai-memory-close {
  flex: 0 0 auto;
  min-height: 28px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--fs-xs);
}
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: center;
  width: 100%;
  min-height: 28px;
  margin: 0;
  padding: var(--space-1) 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn:hover,
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn:focus-visible {
  background: var(--color-fill-muted);
  outline: none;
}
.ai-panel .ai-memory-jump-label {
  flex: 0 0 auto;
  color: var(--color-text-muted);
  font-size: var(--fs-xs);
  white-space: nowrap;
}
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn:hover .ai-memory-jump-label,
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn:focus-visible .ai-memory-jump-label {
  color: var(--color-text);
}

"""
    # Place R25 CSS just before R21 narrow comment so touch chip stays with memory section,
    # or after the R21 block. Prefer after the closing of R21 @container.
    anchor = """  .ai-panel .ai-memory-chip-count {
    flex: 0 0 auto;
  }
}

.ai-panel .ai-header-shortcut kbd {
"""
    if anchor not in css:
        raise SystemExit("R21→header anchor missing")
    css = css.replace(
        anchor,
        """  .ai-panel .ai-memory-chip-count {
    flex: 0 0 auto;
  }
}

"""
        + r25_block
        + """.ai-panel .ai-header-shortcut kbd {
""",
        1,
    )
    css_path.write_text(css, encoding="utf-8")
    print("css: ok")
else:
    print("css: already")

# --- test ---
test = ROOT / "scripts/test-r25-memory-expand.ts"
test.write_text(
    r'''/** R25 polish: working-memory expand — touch target, collapse, audit jump. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildMemoryEvidenceView } from '../src/shared/working-memory-view'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

assert.equal(translate('zh-CN', 'wm.close'), '收起')
assert.equal(translate('zh-CN', 'wm.jumpAudit'), '审计')
assert.ok(translate('zh-CN', 'wm.jumpAuditTip').includes('审计'))
assert.equal(translate('en', 'wm.close'), 'Collapse')
assert.equal(translate('en', 'wm.jumpAudit'), 'Audit')

const view = buildMemoryEvidenceView({
  hostFacts: ['web-01'],
  observations: ['df high'],
  recentCommands: ['systemctl status nginx --no-pager ' + 'x'.repeat(60)],
  maxItems: 3,
  maxChars: 24
})
assert.equal(view.count, 3)
const cmd = view.items.find((it) => it.kind === 'recentCommand')
assert.ok(cmd)
assert.ok(cmd!.text.endsWith('…'), 'display truncated')
assert.ok(cmd!.query && cmd!.query.length > cmd!.text.length, 'query keeps full command')
assert.ok(cmd!.query!.startsWith('systemctl status nginx'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('data-testid="ai-memory-close"'))
assert.ok(panel.includes("tg('wm.close')"))
assert.ok(panel.includes('data-testid="ai-memory-jump-btn"'))
assert.ok(panel.includes('OPEN_AUDIT_EVENT'))
assert.ok(panel.includes("it.kind === 'recentCommand'"))
assert.ok(panel.includes('setMemoryOpen(false)'))
// jump uses full query, not truncated display
assert.ok(panel.includes('it.query || it.text'))

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes('R25 Round25: working-memory expand UX'))
assert.ok(css.includes('.ai-panel .ai-memory-close'))
assert.ok(css.includes('.ai-panel .ai-memory-jump-btn') || css.includes('ai-memory-jump-btn'))
const chipIdx = css.indexOf('.ai-panel .ai-memory-chip {')
assert.ok(chipIdx >= 0)
const chipBlock = css.slice(chipIdx, chipIdx + 450)
assert.ok(chipBlock.includes('min-height: 28px'), 'touch target')
assert.ok(chipBlock.includes('padding: var(--space-1) var(--space-2)'))
const start = css.indexOf('R25 Round25: working-memory expand UX')
const end = css.indexOf('.ai-panel .ai-header-shortcut kbd', start)
const block = css.slice(start, end > start ? end : start + 1800)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks in R25 CSS')

console.log('test-r25-memory-expand: ok')
''',
    encoding="utf-8",
)
print("test: written")

# Wire package.json after r25 harness
pkg = ROOT / "package.json"
raw = pkg.read_text(encoding="utf-8")
needle = 'scripts/test-r25-ai-shot-harness.ts"'
insert = 'scripts/test-r25-ai-shot-harness.ts && npx tsx --tsconfig tsconfig.web.json scripts/test-r25-memory-expand.ts"'
if "test-r25-memory-expand" in raw:
    print("pkg: already")
elif needle not in raw:
    raise SystemExit("pkg needle missing")
else:
    pkg.write_text(raw.replace(needle, insert, 1), encoding="utf-8")
    print("pkg: wired")

print("item2 patch done")
