# -*- coding: utf-8 -*-
"""R23 item2: after 带证据重试, auto-scroll to new confirm card."""
from pathlib import Path

ROOT = Path('.')

def norm(p: Path) -> str:
    return p.read_text(encoding='utf-8').replace('\r\n', '\n')

def write(p: Path, s: str) -> None:
    p.write_text(s, encoding='utf-8', newline='\n')

panel_path = ROOT / 'src/renderer/src/components/AIPanel.tsx'
panel = norm(panel_path)

# 1) Insert module-level helper after imports / before types — find a stable anchor near OPEN_AUDIT
helper = '''
/** Round 23: scroll + calm highlight when a confirm appears after 「带证据重试」. */
function focusAiPendingAfterFailure(requestId?: string | null) {
  const dock = document.querySelector<HTMLElement>('[data-testid="ai-pending-confirm"]')
  const card = requestId
    ? document.querySelector(`[data-confirm-id="${CSS.escape(requestId)}"]`)
    : null
  if (dock) {
    dock.classList.add('is-after-failure-focus')
    dock.setAttribute('data-after-failure-focus', '1')
    dock.setAttribute('data-after-evidence-retry', '1')
  }
  const target = dock || card
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  if (card && card !== target) card.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    dock?.classList.remove('is-after-failure-focus')
    dock?.removeAttribute('data-after-failure-focus')
    dock?.removeAttribute('data-after-evidence-retry')
  }, 4200)
  const agree =
    document.querySelector<HTMLButtonElement>('[data-testid="ai-pending-agree"]') ||
    document.querySelector<HTMLButtonElement>('[data-testid="ai-pending-need-session"]')
  agree?.focus()
}

'''

if 'focusAiPendingAfterFailure' not in panel:
    anchor = 'export const OPEN_AUDIT_EVENT = '
    # Actually OPEN_AUDIT is in ExecReplay. Find type Props or similar near top of AIPanel.
    # Use: type UserLine = 
    if 'type UserLine = { role: \'user\'; content: string }' not in panel:
        raise SystemExit('UserLine anchor missing')
    panel = panel.replace(
        'type UserLine = { role: \'user\'; content: string }',
        helper + 'type UserLine = { role: \'user\'; content: string }',
        1,
    )

# 2) Add ref near pendingAgreeRef
if 'scrollConfirmAfterEvidenceRetryRef' not in panel:
    needle = 'const pendingAgreeRef = useRef<HTMLButtonElement>(null)'
    if needle not in panel:
        raise SystemExit('pendingAgreeRef missing')
    panel = panel.replace(
        needle,
        needle + '\n  /** Round 23: one-shot — scroll to confirm after 带证据重试. */\n  const scrollConfirmAfterEvidenceRetryRef = useRef(false)',
        1,
    )

# 3) Replace pendingConfirm scroll effect
old_effect = """  // Keep the waiting confirm card in view, and surface a dock above the composer.
  useEffect(() => {
    if (!pendingConfirm?.requestId) return
    const el = document.querySelector(`[data-confirm-id="${pendingConfirm.requestId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [pendingConfirm?.requestId])"""

new_effect = """  // Keep the waiting confirm card in view, and surface a dock above the composer.
  // Round 23: after 「带证据重试」, force-scroll + highlight the new confirm (wins over tail scroll).
  useEffect(() => {
    if (!pendingConfirm?.requestId) return
    const id = pendingConfirm.requestId
    const fromEvidenceRetry = scrollConfirmAfterEvidenceRetryRef.current
    if (fromEvidenceRetry) {
      scrollConfirmAfterEvidenceRetryRef.current = false
      const run = () => focusAiPendingAfterFailure(id)
      requestAnimationFrame(() => requestAnimationFrame(run))
      const t = window.setTimeout(run, 180)
      return () => window.clearTimeout(t)
    }
    const el = document.querySelector(`[data-confirm-id="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [pendingConfirm?.requestId])"""

if old_effect not in panel:
    raise SystemExit('pendingConfirm scroll effect not found')
panel = panel.replace(old_effect, new_effect, 1)

# 4) Set ref in retryWithFailureEvidence
old_retry_tail = """      const ask = tg('fail.retryAsk', { evidence, command: cmd || '—' })
      void submitToAi(ask)
    },
    [busy, submitToAi]
  )"""
new_retry_tail = """      const ask = tg('fail.retryAsk', { evidence, command: cmd || '—' })
      scrollConfirmAfterEvidenceRetryRef.current = true
      void submitToAi(ask)
    },
    [busy, submitToAi]
  )"""
if old_retry_tail not in panel:
    raise SystemExit('retryWithFailureEvidence tail not found')
panel = panel.replace(old_retry_tail, new_retry_tail, 1)

# 5) Simplify next-confirm button to reuse helper
old_btn = """                        onClick={() => {
                          const dock = document.querySelector<HTMLElement>('[data-testid="ai-pending-confirm"]')
                          if (!dock) return
                          dock.classList.add('is-after-failure-focus')
                          dock.setAttribute('data-after-failure-focus', '1')
                          dock.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
                          window.setTimeout(() => {
                            dock.classList.remove('is-after-failure-focus')
                            dock.removeAttribute('data-after-failure-focus')
                          }, 4200)
                          pendingAgreeRef.current?.focus()
                        }}"""
new_btn = """                        onClick={() => focusAiPendingAfterFailure(pendingConfirm?.requestId)}"""
if old_btn not in panel:
    raise SystemExit('next-confirm onClick not found')
panel = panel.replace(old_btn, new_btn, 1)

write(panel_path, panel)

# CSS note under R23 block
css_path = ROOT / 'src/renderer/src/styles.css'
css = norm(css_path)
extra = """/* R23 Round23 polish: confirm dock mark after evidence-retry auto-scroll */
.ai-panel .ai-pending-confirm[data-after-evidence-retry='1'] {
  border-left-color: var(--color-accent);
}

"""
if "data-after-evidence-retry" not in css:
    marker = '/* R23 Round23: one calm failure story'
    if marker not in css:
        raise SystemExit('R23 CSS marker missing')
    css = css.replace(marker, extra + marker, 1)
    write(css_path, css)

# Test
test = r'''/** R23 polish: after 「带证据重试」, auto-scroll to the new confirm card. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes('function focusAiPendingAfterFailure'), 'shared focus helper')
assert.ok(panel.includes('scrollConfirmAfterEvidenceRetryRef'), 'one-shot ref')
assert.ok(panel.includes('scrollConfirmAfterEvidenceRetryRef.current = true'), 'arm before submit')
assert.ok(panel.includes("data-after-evidence-retry"), 'dock mark for auto-scroll')
assert.ok(panel.includes('focusAiPendingAfterFailure(id)'), 'effect calls helper')
assert.ok(panel.includes('focusAiPendingAfterFailure(pendingConfirm?.requestId)'), 'next-confirm reuses helper')
assert.ok(panel.includes('window.setTimeout(run, 180)'), 'delayed pass beats tail scroll')

// Must not arm on exhausted path (composer draft only)
const retryFn = panel.slice(
  panel.indexOf('const retryWithFailureEvidence'),
  panel.indexOf('const retryLastUser')
)
assert.ok(retryFn.includes("tg('fail.exhaustedAsk'"))
const exhaustedIdx = retryFn.indexOf("tg('fail.exhaustedAsk'")
const armIdx = retryFn.indexOf('scrollConfirmAfterEvidenceRetryRef.current = true')
assert.ok(armIdx > exhaustedIdx, 'arm only on non-exhausted path after exhausted branch')
assert.ok(!/confirmStep\([^)]*true/.test(retryFn), 'retry must not confirmStep')

const css = norm('src/renderer/src/styles.css')
assert.ok(css.includes("data-after-evidence-retry='1'") || css.includes('data-after-evidence-retry'))
const start = css.indexOf('R23 Round23 polish: confirm dock mark')
assert.ok(start >= 0)
const end = css.indexOf('/* R23 Round23: one calm failure story', start)
const block = css.slice(start, end > start ? end : start + 800)
assert.equal(/var\(--[^,)]+,\s*[^)]+\)/.test(block), false, 'no token fallbacks')

console.log('test-r23-retry-scroll-confirm: ok')
'''
(ROOT / 'scripts/test-r23-retry-scroll-confirm.ts').write_text(test, encoding='utf-8', newline='\n')
print('item2 patch ok')
