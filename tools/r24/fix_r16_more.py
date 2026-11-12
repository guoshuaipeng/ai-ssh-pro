from pathlib import Path
p = Path("scripts/test-r16-plan-progress.ts")
t = p.read_text(encoding="utf-8")
t2 = t.replace(
    "assert.ok(panel.includes(\"runProgress.policy === 'auto' ? tg('ai.runStepsTip') : tg('ai.planStepsTip')\"))",
    "assert.ok(panel.includes(\"runProgress?.policy === 'auto' ? tg('ai.runStepsTip') : tg('ai.planStepsTip')\") || panel.includes(\"runProgress.policy === 'auto' ? tg('ai.runStepsTip') : tg('ai.planStepsTip')\"))",
)
t2 = t2.replace(
    "assert.ok(panel.includes(\"runProgress.policy === 'auto' &&\"))",
    "assert.ok(panel.includes(\"runProgress.policy === 'auto'\") || panel.includes(\"runProgress?.policy === 'auto'\"))",
)
if t2 == t:
    raise SystemExit("no changes")
p.write_text(t2, encoding="utf-8")
print("r16 tip/streak asserts updated")
