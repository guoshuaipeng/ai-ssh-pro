from pathlib import Path

p = Path('src/renderer/src/components/AIPanel.tsx')
t = p.read_text(encoding='utf-8')

# Update import from ExecReplay
old_imp = "import ExecReplay, { OPEN_AUDIT_EVENT } from './ExecReplay'"
new_imp = "import ExecReplay, { OPEN_AUDIT_EVENT, type OpenAiFromAuditDetail } from './ExecReplay'"
if 'OpenAiFromAuditDetail' not in t:
    if old_imp not in t:
        raise SystemExit('ExecReplay import not found')
    t = t.replace(old_imp, new_imp, 1)

# Add props to type
old_prop = "  /** Bump to scroll/focus the pending dock/card (status-bar chip). */\n  focusPendingToken?: number\n}"
new_prop = """  /** Bump to scroll/focus the pending dock/card (status-bar chip). */
  focusPendingToken?: number
  /** Round 17: bump after audit → AI jump to focus matching exec/command. */
  focusExecToken?: number
  focusExec?: OpenAiFromAuditDetail | null
}"""
if 'focusExecToken?:' not in t:
    if old_prop not in t:
        raise SystemExit('focusPendingToken prop type not found')
    t = t.replace(old_prop, new_prop, 1)

# Destructure defaults
old_def = "  focusPendingToken = 0\n}: Props) {"
new_def = """  focusPendingToken = 0,
  focusExecToken = 0,
  focusExec = null
}: Props) {"""
if 'focusExecToken = 0' not in t:
    if old_def not in t:
        raise SystemExit('focusPendingToken default not found')
    t = t.replace(old_def, new_def, 1)

# Add effect after focusPendingToken effect — find that effect end
# Look for the focusPendingToken effect
marker = """  }, [focusPendingToken, pendingConfirm?.requestId, pendingConfirm?.action, activeSessionId])
"""
effect = """  }, [focusPendingToken, pendingConfirm?.requestId, pendingConfirm?.action, activeSessionId])

  // Round 17: focus card matching audit id / command after jump-from-audit
  useEffect(() => {
    if (!focusExecToken) return
    const id = focusExec?.id?.trim() || ''
    const cmd = focusExec?.text?.trim() || ''
    const root = document.querySelector('.ai-panel') || document
    let el: Element | null = null
    if (id) el = root.querySelector(`[data-exec-audit-id="${CSS.escape(id)}"]`)
    if (!el && cmd) {
      const cards = Array.from(root.querySelectorAll('[data-testid="ai-reply-card"][data-exec-command]'))
      el =
        cards.find((c) => (c.getAttribute('data-exec-command') || '') === cmd) ||
        cards.find((c) => {
          const v = c.getAttribute('data-exec-command') || ''
          return v && (cmd.includes(v) || v.includes(cmd.split(' ')[0] || ''))
        }) ||
        null
    }
    if (!el && cmd) {
      // Fallback: any exec replay whose sibling command text matches
      el =
        Array.from(root.querySelectorAll('[data-testid="ai-exec-replay"]')).find((node) => {
          const card = node.closest('[data-testid="ai-reply-card"]')
          const attr = card?.getAttribute('data-exec-command') || ''
          return attr && (attr === cmd || cmd.includes(attr) || attr.includes(cmd))
        }) || null
    }
    root.querySelectorAll('.is-audit-focus').forEach((n) => n.classList.remove('is-audit-focus'))
    if (!el) {
      showToast(tg('au2.openAiMiss'))
      return
    }
    const card = el.closest('[data-testid="ai-reply-card"]') || el
    card.classList.add('is-audit-focus')
    card.setAttribute('data-audit-focus', '1')
    card.scrollIntoView({ behavior: 'smooth', block: 'center' })
    const toggle = card.querySelector<HTMLButtonElement>('[data-testid="ai-exec-toggle"]')
    if (toggle && toggle.getAttribute('aria-expanded') === 'false') toggle.click()
    const tmr = window.setTimeout(() => {
      card.classList.remove('is-audit-focus')
      card.removeAttribute('data-audit-focus')
    }, 4200)
    return () => window.clearTimeout(tmr)
  }, [focusExecToken, focusExec?.id, focusExec?.text])
"""
if 'Round 17: focus card matching audit' not in t:
    if marker not in t:
        raise SystemExit('focusPendingToken effect end not found')
    t = t.replace(marker, effect, 1)

# Add data attributes on command cards that have exec or command
# Find ExecReplay mount and the parent card div
# The card div is:
# className={`msg assistant ai-structured ai-dark-card${isConfirmable ? ' is-active-plan-step' : ''}`}
# data-testid="ai-reply-card"
# data-card={card}
# data-confirm-id={l.requestId || undefined}
# data-active-plan={isConfirmable ? '1' : undefined}

old_card_attrs = """                className={`msg assistant ai-structured ai-dark-card${isConfirmable ? ' is-active-plan-step' : ''}`}
                data-testid="ai-reply-card"
                data-card={card}
                data-confirm-id={l.requestId || undefined}
                data-active-plan={isConfirmable ? '1' : undefined}
              >"""
new_card_attrs = """                className={`msg assistant ai-structured ai-dark-card${isConfirmable ? ' is-active-plan-step' : ''}`}
                data-testid="ai-reply-card"
                data-card={card}
                data-confirm-id={l.requestId || undefined}
                data-active-plan={isConfirmable ? '1' : undefined}
                data-exec-audit-id={l.exec?.auditId || undefined}
                data-exec-command={s.command || undefined}
              >"""
if 'data-exec-audit-id={l.exec?.auditId' not in t:
    if old_card_attrs not in t:
        raise SystemExit('structured card attrs not found')
    t = t.replace(old_card_attrs, new_card_attrs, 1)

p.write_text(t, encoding='utf-8')
print('AIPanel ok')
