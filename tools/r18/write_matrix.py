# -*- coding: utf-8 -*-
"""R18 item2: bidirectional audit↔dialog screenshot matrix."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- matrix file ---
(ROOT / "scripts" / "ai-shot-matrix-r18.mjs").write_text(
    r'''/** Round 18: audit↔dialog bidirectional deep-link screenshot matrix.
 * Injected into screenshot-key-screens.mjs chrome set via JSON.stringify.
 */
export const R18_AI_SHOT_NAMES = [
  'r18-plan-step-align',
  'r18-ai-to-audit',
  'r18-audit-to-ai',
  'r18-audit-open-ai'
]

/** @returns {Array<{name:string,narrow?:boolean,wait?:number,steps:Array<object>,expect?:string}>} */
export function r18AiShots() {
  const open = [
    { op: 'menu', action: 'demoHost' },
    { op: 'aiChat', empty: true }
  ]
  const seedAudit = {
    eval:
      "localStorage.setItem('aiss.audit.enabled','1'); const now=Date.now(); localStorage.setItem('aiss.audit.v1', JSON.stringify([{id:'aud-r18-1',at:now-10000,type:'command',host:'demo-host',source:'AI',outcome:'allowed',detail:'ps aux --sort=-%mem | head -n 11',protection:'normal',tabNo:1,policyChosen:'ask',policyEffective:'ask',policySource:'global'},{id:'aud-r18-u',at:now-20000,type:'connect',host:'bastion',source:'user',outcome:'allowed',detail:'ssh'}])); window.dispatchEvent(new Event('aiss-audit-changed')); true"
  }
  return [
    {
      name: 'r18-plan-step-align',
      wait: 1300,
      steps: [...open, { op: 'aiPlanStepAlign', runStep: 7, max: 10 }],
      expect:
        "(()=>{const chip=document.querySelector('[data-testid=ai-run-steps]');const badge=document.querySelector('[data-testid=ai-active-plan-step]');const step=document.querySelector('[data-testid=ai-step-index]');if(!chip||!badge||!step)return false;const a=chip.getAttribute('data-aligned-step');const b=badge.getAttribute('data-aligned-step');const src=chip.getAttribute('data-step-source');return a==='2'&&b==='2'&&src==='suggestion'&&a===b;})()"
    },
    {
      name: 'r18-ai-to-audit',
      wait: 1400,
      steps: [...open, { op: 'aiExecAuditLink' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-exec-replay]')&&document.querySelector('[data-testid=ai-exec-audit]')&&!document.querySelector('[data-testid=ai-exec-audit].is-muted'))"
    },
    {
      name: 'r18-audit-to-ai',
      wait: 1400,
      steps: [...open, { op: 'aiAuditFocus', auditId: 'aud-r18-focus' }],
      expect:
        "!!(document.querySelector('[data-testid=ai-reply-card].is-audit-focus')||document.querySelector('[data-audit-focus=\"1\"]'))"
    },
    {
      name: 'r18-audit-open-ai',
      wait: 1400,
      steps: [seedAudit, { op: 'menu', action: 'auditLog' }],
      expect: "!!document.querySelector('[data-testid=audit-open-ai]')"
    }
  ]
}
''',
    encoding="utf-8",
)

# --- hooks ---
hooks = ROOT / "src" / "renderer" / "src" / "lib" / "screenshot-hooks.ts"
ht = hooks.read_text(encoding="utf-8")
if "aiPlanStepAlign" not in ht:
    old = """  /** Round 17: sticky batch bar with >=2 suggestion commands. */
  | { op: "aiBatchSticky" }
"""
    new = """  /** Round 17: sticky batch bar with >=2 suggestion commands. */
  | { op: "aiBatchSticky" }
  /** Round 18: plan step align — runProgress drifts vs suggestionStepNo. */
  | { op: "aiPlanStepAlign"; runStep?: number; max?: number }
  /** Round 18: AI card with ExecReplay jump-to-audit button. */
  | { op: "aiExecAuditLink" }
  /** Round 18: AI card highlighted as if arrived from audit row. */
  | { op: "aiAuditFocus"; auditId?: string; command?: string }
"""
    if old not in ht:
        raise SystemExit("hooks anchor missing")
    hooks.write_text(ht.replace(old, new, 1), encoding="utf-8")
    print("hooks patched")
else:
    print("hooks already have r18 ops")

print("matrix written")
