from pathlib import Path

# R18: badge now forces alignedPlan (R24) — keep anti-regression on raw runProgress.
p = Path("scripts/test-r18-plan-step-align.ts")
t = p.read_text(encoding="utf-8")
old = "assert.ok(panel.includes('suggestionStepNo.get(i) ?? alignedPlan.step'))"
new = """assert.ok(panel.includes('data-testid=\"ai-active-plan-step\"'))
assert.ok(panel.includes('data-aligned-step={alignedPlan.step}'), 'confirmable badge uses alignedPlan')
assert.ok(panel.includes('planStepDisplayMax(alignedPlan)'), 'shared display max')"""
if old not in t:
    raise SystemExit("r18 badge assert missing")
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print("r18 badge assert updated")

# R16: optional chaining on runProgress.policy
p16 = Path("scripts/test-r16-plan-progress.ts")
t16 = p16.read_text(encoding="utf-8")
old16 = "assert.ok(panel.includes('data-policy={runProgress.policy || undefined}'))"
new16 = "assert.ok(panel.includes('data-policy={runProgress?.policy || undefined}') || panel.includes('data-policy={runProgress.policy || undefined}'))"
if old16 not in t16:
    raise SystemExit("r16 policy assert missing: " + repr([ln for ln in t16.splitlines() if "runProgress.policy" in ln]))
p16.write_text(t16.replace(old16, new16, 1), encoding="utf-8")
print("r16 policy assert updated")
