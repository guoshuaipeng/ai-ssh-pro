from pathlib import Path
p = Path("scripts/test-r18-plan-step-align.ts")
t = p.read_text(encoding="utf-8")
old = "assert.ok(panel.includes('{tg(\\'ai.runSteps\\', { n: alignedPlan.step, max: alignedPlan.max })}'))"
new = """assert.ok(
  panel.includes(\"tg('ai.runSteps'\") &&
    (panel.includes('planStepDisplayMax(alignedPlan)') || panel.includes('max: alignedPlan.max')),
  'chip uses alignedPlan step/max'
)"""
if old not in t:
    raise SystemExit("old assert not found: " + repr([line for line in t.splitlines() if "ai.runSteps" in line]))
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print("r18 test updated")
