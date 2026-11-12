# -*- coding: utf-8 -*-
"""R24 item1: post-retry confirm aligned with plan-step chip."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# --- shared helper: display max ---
shared = ROOT / "src/shared/ai-suggestion-steps.ts"
s = shared.read_text(encoding="utf-8")
needle = "  return { step, max, source }\n}\n"
if "export function planStepDisplayMax" not in s:
    insert = needle + """
/** Display max for chip / badge / dock — never below step. */
export function planStepDisplayMax(aligned: { step: number; max: number }): number {
  return Math.max(aligned.max, aligned.step, 1)
}
"""
    if needle not in s:
        raise SystemExit("shared needle missing")
    shared.write_text(s.replace(needle, insert, 1), encoding="utf-8")
    print("shared: planStepDisplayMax ok")
else:
    print("shared: already has planStepDisplayMax")

# --- AIPanel imports ---
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
p = panel_path.read_text(encoding="utf-8")

old_imp = """alignPlanStepDisplay,
  buildSuggestionStepNos,
  findConfirmableLineIndex"""
new_imp = """alignPlanStepDisplay,
  buildSuggestionStepNos,
  findConfirmableLineIndex,
  planStepDisplayMax"""
if "planStepDisplayMax" not in p.split("from '../../../shared/ai-suggestion-steps'")[0][-400:]:
    if old_imp not in p:
        # try alternate import shape
        if "alignPlanStepDisplay," in p and "planStepDisplayMax" not in p:
            p = p.replace(
                "alignPlanStepDisplay,\n  buildSuggestionStepNos,\n  findConfirmableLineIndex",
                "alignPlanStepDisplay,\n  buildSuggestionStepNos,\n  findConfirmableLineIndex,\n  planStepDisplayMax",
                1,
            )
            print("panel: import patched (alt)")
        else:
            raise SystemExit("import block not found")
    else:
        p = p.replace(old_imp, new_imp, 1)
        print("panel: import patched")
else:
    print("panel: import already")

# --- badge: force alignedPlan when confirmable ---
old_badge = """                {isConfirmable ? (
                  <span
                    className="ai-active-plan-badge"
                    data-testid="ai-active-plan-step"
                    data-aligned-step={suggestionStepNo.get(i) ?? alignedPlan.step}
                    data-aligned-max={Math.max(alignedPlan.max, suggestionStepNo.get(i) ?? alignedPlan.step, 1)}
                  >
                    {tg('ai.activePlanStep', { n: suggestionStepNo.get(i) ?? alignedPlan.step, max: Math.max(alignedPlan.max, suggestionStepNo.get(i) ?? alignedPlan.step, 1) })}
                  </span>
                ) : null}"""
new_badge = """                {isConfirmable ? (
                  <span
                    className="ai-active-plan-badge"
                    data-testid="ai-active-plan-step"
                    data-aligned-step={alignedPlan.step}
                    data-aligned-max={planStepDisplayMax(alignedPlan)}
                    data-step-source={alignedPlan.source}
                  >
                    {tg('ai.activePlanStep', { n: alignedPlan.step, max: planStepDisplayMax(alignedPlan) })}
                  </span>
                ) : null}"""
if old_badge not in p:
    raise SystemExit("badge block not found")
p = p.replace(old_badge, new_badge, 1)
print("panel: badge aligned")

# --- dock title: add plan step ---
old_dock = """          <div className="ai-pending-confirm-main">
            <div className="ai-pending-confirm-title">{tg('ux64.pendingTitle')}</div>
            {pendingPreview ? ("""
new_dock = """          <div className="ai-pending-confirm-main">
            <div className="ai-pending-confirm-title">
              <span>{tg('ux64.pendingTitle')}</span>
              {alignedPlan.step ? (
                <span
                  className="ai-pending-plan-step"
                  data-testid="ai-pending-plan-step"
                  data-aligned-step={alignedPlan.step}
                  data-aligned-max={planStepDisplayMax(alignedPlan)}
                  data-step-source={alignedPlan.source}
                  title={tg('ai.planStepsTip')}
                >
                  {tg('ai.activePlanStep', { n: alignedPlan.step, max: planStepDisplayMax(alignedPlan) })}
                </span>
              ) : null}
            </div>
            {pendingPreview ? ("""
if old_dock not in p:
    raise SystemExit("dock block not found")
p = p.replace(old_dock, new_dock, 1)
print("panel: dock step ok")

# Also stamp dock root with aligned attrs when pending
old_dock_root = """          data-testid="ai-pending-confirm"
          data-action={pendingConfirm.action}
          data-r19-narrow="1"
          data-after-failure={hasFailedExecPin(lines) ? '1' : undefined}
        >"""
new_dock_root = """          data-testid="ai-pending-confirm"
          data-action={pendingConfirm.action}
          data-r19-narrow="1"
          data-after-failure={hasFailedExecPin(lines) ? '1' : undefined}
          data-aligned-step={alignedPlan.step}
          data-aligned-max={planStepDisplayMax(alignedPlan)}
          data-step-source={alignedPlan.source}
        >"""
if old_dock_root not in p:
    raise SystemExit("dock root attrs not found")
p = p.replace(old_dock_root, new_dock_root, 1)
print("panel: dock root attrs")

# --- chip: show when pendingConfirm OR busy+runProgress ---
old_chip = """            {busy && runProgress ? (
              <span
                className="ai-run-steps"
                data-testid="ai-run-steps"
                data-policy={runProgress.policy || undefined}
                data-aligned-step={alignedPlan.step}
                data-aligned-max={alignedPlan.max}
                data-step-source={alignedPlan.source}
                title={runProgress.policy === 'auto' ? tg('ai.runStepsTip') : tg('ai.planStepsTip')}
              >
                {tg('ai.runSteps', { n: alignedPlan.step, max: alignedPlan.max })}
                {runProgress.policy === 'auto' &&
                typeof runProgress.streak === 'number' &&
                typeof runProgress.streakCap === 'number' &&
                runProgress.streakCap > 0 ? ("""
new_chip = """            {(busy && runProgress) || pendingConfirm ? (
              <span
                className="ai-run-steps"
                data-testid="ai-run-steps"
                data-policy={runProgress?.policy || undefined}
                data-aligned-step={alignedPlan.step}
                data-aligned-max={planStepDisplayMax(alignedPlan)}
                data-step-source={alignedPlan.source}
                data-pending-align={pendingConfirm ? '1' : undefined}
                title={runProgress?.policy === 'auto' ? tg('ai.runStepsTip') : tg('ai.planStepsTip')}
              >
                {tg('ai.runSteps', { n: alignedPlan.step, max: planStepDisplayMax(alignedPlan) })}
                {runProgress &&
                runProgress.policy === 'auto' &&
                typeof runProgress.streak === 'number' &&
                typeof runProgress.streakCap === 'number' &&
                runProgress.streakCap > 0 ? ("""
if old_chip not in p:
    raise SystemExit("chip block not found")
p = p.replace(old_chip, new_chip, 1)
print("panel: chip pending-align")

# failure-next-confirm: use planStepDisplayMax for consistency (shorten in item2)
old_next = """                        {tg('fail.nextConfirm')}
                        {alignedPlan.step ? ` · ${tg('ai.activePlanStep', { n: alignedPlan.step, max: Math.max(alignedPlan.max, alignedPlan.step, 1) })}` : ''}"""
new_next = """                        {tg('fail.nextConfirm')}
                        {alignedPlan.step ? ` · ${tg('ai.activePlanStep', { n: alignedPlan.step, max: planStepDisplayMax(alignedPlan) })}` : ''}"""
if old_next not in p:
    raise SystemExit("next-confirm block not found")
p = p.replace(old_next, new_next, 1)
print("panel: next-confirm max helper")

panel_path.write_text(p, encoding="utf-8")
print("AIPanel written")

# --- CSS for pending plan step ---
css_path = ROOT / "src/renderer/src/styles.css"
css = css_path.read_text(encoding="utf-8")
marker = "/* R23 Round23 polish: confirm dock mark after evidence-retry auto-scroll */"
block = """/* R24 Round24: pending dock plan step shares alignPlanStepDisplay with chip/badge */
.ai-panel .ai-pending-confirm-title {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  min-width: 0;
}
.ai-panel .ai-pending-plan-step {
  display: inline-flex;
  align-items: center;
  padding: 0 var(--space-2);
  min-height: 1.25rem;
  border-radius: var(--radius-sm);
  background: var(--color-bg-muted);
  color: var(--color-accent);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ai-composer-bar .ai-run-steps[data-pending-align='1'] {
  opacity: 1;
}

"""
if "R24 Round24: pending dock plan step" not in css:
    if marker not in css:
        raise SystemExit("css marker missing")
    css = css.replace(marker, block + marker, 1)
    css_path.write_text(css, encoding="utf-8")
    print("css: r24 pending step")
else:
    print("css: already")

print("item1 patch done")
