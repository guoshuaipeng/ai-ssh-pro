from pathlib import Path

# 1) screenshot-hooks type
hooks = Path("src/renderer/src/lib/screenshot-hooks.ts")
ht = hooks.read_text(encoding="utf-8")
needle = '| { op: "aiFailureEvidence"; nextConfirm?: string; withMemory?: boolean }'
insert = needle + '\n  /** Round 28: seed audit + open with non-matching filter → filter-empty (not true-empty). */\n  | { op: "auditFilterEmpty"; host?: string; query?: string; seedDetail?: string }'
if 'op: "auditFilterEmpty"' not in ht:
    assert needle in ht
    ht = ht.replace(needle, insert, 1)
    hooks.write_text(ht, encoding="utf-8")
    print("hooks ok")
else:
    print("hooks already")

# 2) App.tsx — handle op in shot listener
app = Path("src/renderer/src/App.tsx")
at = app.read_text(encoding="utf-8")
# Add to AI op list? Better handle separately before menu, since it opens audit not AI.
anchor = """      if (detail.op === 'menu') {
        handleTitlebarMenuAction(detail.action as TitlebarMenuAction)
        return
      }"""
block = """      if (detail.op === 'auditFilterEmpty') {
        // Round 28: deliberate filter-empty — seed one AI command, open audit with a non-matching query.
        setQuickOpen(false)
        setTourOpen(false)
        const d = detail as { host?: string; query?: string; seedDetail?: string }
        const hostKey = (d.host || 'demo').trim() || 'demo'
        const seedDetail = (d.seedDetail || 'systemctl status nginx --no-pager').trim()
        const miss = (d.query || 'zzz-r28-no-match').trim()
        appendAudit({
          type: 'command',
          host: hostKey,
          source: 'AI',
          outcome: 'allowed',
          detail: seedDetail,
          demo: true,
          tabNo: 1,
          policyChosen: 'ask',
          policyEffective: 'ask',
          policySource: 'temp'
        })
        window.dispatchEvent(new Event('aiss-audit-changed'))
        openAudit(hostKey, undefined, { source: 'AI', type: 'command', text: miss })
        return
      }
""" + anchor
if "auditFilterEmpty" not in at.split("if (detail.op === 'menu')")[0][-800:]:
    # only insert if not already present near menu handler
    if "detail.op === 'auditFilterEmpty'" not in at:
        assert anchor in at, "menu anchor missing"
        at = at.replace(anchor, block, 1)
        app.write_text(at, encoding="utf-8")
        print("App auditFilterEmpty ok")
    else:
        print("App already has auditFilterEmpty")
else:
    print("App skip")

# 3) Decline CSS at end of styles (before last lines) — append R28 block
css = Path("src/renderer/src/styles.css")
ct = css.read_text(encoding="utf-8")
r28css = """
/* R28 Round28: demote pending Decline vs Agree (primary CTA stays Agree) */
.ai-panel .ai-pending-confirm-actions .ai-btn-decline {
  border-color: transparent;
  background: transparent;
  color: var(--color-text-secondary);
  font-weight: var(--fw-regular);
  box-shadow: none;
}
.ai-panel .ai-pending-confirm-actions .ai-btn-decline:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-bg-muted) 80%, transparent);
  color: var(--color-text-primary);
  border-color: transparent;
}
.ai-panel .ai-pending-confirm-actions .ai-btn-decline:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}
@container (max-width: 280px) {
  .ai-panel .ai-pending-confirm-actions .ai-btn-decline .ai-btn-text {
    /* keep label; weight already demoted — do not compete with Agree fill */
    font-weight: var(--fw-regular);
  }
}
"""
if "R28 Round28: demote pending Decline" not in ct:
    ct = ct.rstrip() + "\n" + r28css
    css.write_text(ct, encoding="utf-8")
    print("CSS decline ok")
else:
    print("CSS already")
