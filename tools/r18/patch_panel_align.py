# -*- coding: utf-8 -*-
"""R18 item1: wire AIPanel to alignPlanStepDisplay."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
path = ROOT / "src" / "renderer" / "src" / "components" / "AIPanel.tsx"
text = path.read_text(encoding="utf-8")
orig = text

# 1) import
old_imp = "import { collectSuggestionCommands, formatSuggestionCommandsForCopy } from '@shared/ai-suggestion-steps'"
new_imp = (
    "import {\n"
    "  alignPlanStepDisplay,\n"
    "  buildSuggestionStepNos,\n"
    "  collectSuggestionCommands,\n"
    "  findConfirmableLineIndex,\n"
    "  formatSuggestionCommandsForCopy\n"
    "} from '@shared/ai-suggestion-steps'"
)
if old_imp not in text:
    raise SystemExit("import not found")
text = text.replace(old_imp, new_imp, 1)

# 2) suggestionStepNo useMemo → shared builder
old_memo = """  // H07: number consecutive command/tool suggestion cards so steps stay readable.
  const suggestionStepNo = useMemo(() => {
    const map = new Map<number, number>()
    let n = 0
    lines.forEach((row, idx) => {
      if (row.role !== 'assistant' || !row.structured) return
      const action = row.structured.action
      if (action === 'command' || action === 'tool_call') {
        n += 1
        map.set(idx, n)
      }
    })
    return map
  }, [lines])
"""
new_memo = """  // H07/R18: number consecutive command/tool suggestion cards; chip+badge share this map.
  const suggestionStepNo = useMemo(() => buildSuggestionStepNos(lines), [lines])
  const alignedPlan = useMemo(() => {
    const confirmIdx = findConfirmableLineIndex(lines, pendingConfirm?.requestId)
    const sugStep = confirmIdx >= 0 ? suggestionStepNo.get(confirmIdx) : undefined
    return alignPlanStepDisplay({
      runStep: runProgress?.step,
      runMax: runProgress?.max,
      suggestionStep: sugStep,
      suggestionCount: suggestionStepNo.size
    })
  }, [lines, pendingConfirm?.requestId, suggestionStepNo, runProgress])
"""
if old_memo not in text:
    raise SystemExit("suggestionStepNo memo not found")
text = text.replace(old_memo, new_memo, 1)

# 3) active plan badge — prefer suggestion step for THIS card (same as step label)
old_badge = """                    {tg('ai.activePlanStep', { n: runProgress?.step ?? suggestionStepNo.get(i) ?? 1, max: Math.max(runProgress?.max ?? 0, suggestionStepNo.size, suggestionStepNo.get(i) ?? 1, 1) })}"""
new_badge = """                    {tg('ai.activePlanStep', { n: suggestionStepNo.get(i) ?? alignedPlan.step, max: Math.max(alignedPlan.max, suggestionStepNo.get(i) ?? alignedPlan.step, 1) })}"""
if old_badge not in text:
    raise SystemExit("activePlanStep badge not found")
text = text.replace(old_badge, new_badge, 1)

# 4) composer chip — use alignedPlan
old_chip = """            {busy && runProgress ? (
              <span
                className="ai-run-steps"
                data-testid="ai-run-steps"
                data-policy={runProgress.policy || undefined}
                title={runProgress.policy === 'auto' ? tg('ai.runStepsTip') : tg('ai.planStepsTip')}
              >
                {tg('ai.runSteps', { n: runProgress.step, max: runProgress.max })}
"""
new_chip = """            {busy && runProgress ? (
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
"""
if old_chip not in text:
    raise SystemExit("run-steps chip not found")
text = text.replace(old_chip, new_chip, 1)

# 5) also stamp active badge with data-aligned-step for harness
old_badge_el = """                  <span className="ai-active-plan-badge" data-testid="ai-active-plan-step">
                    {tg('ai.activePlanStep', { n: suggestionStepNo.get(i) ?? alignedPlan.step, max: Math.max(alignedPlan.max, suggestionStepNo.get(i) ?? alignedPlan.step, 1) })}
                  </span>"""
new_badge_el = """                  <span
                    className="ai-active-plan-badge"
                    data-testid="ai-active-plan-step"
                    data-aligned-step={suggestionStepNo.get(i) ?? alignedPlan.step}
                    data-aligned-max={Math.max(alignedPlan.max, suggestionStepNo.get(i) ?? alignedPlan.step, 1)}
                  >
                    {tg('ai.activePlanStep', { n: suggestionStepNo.get(i) ?? alignedPlan.step, max: Math.max(alignedPlan.max, suggestionStepNo.get(i) ?? alignedPlan.step, 1) })}
                  </span>"""
if old_badge_el not in text:
    raise SystemExit("badge element wrap not found")
text = text.replace(old_badge_el, new_badge_el, 1)

if text == orig:
    raise SystemExit("no changes applied")
path.write_text(text, encoding="utf-8")
print("patched AIPanel.tsx")
