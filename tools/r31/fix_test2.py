from pathlib import Path
p = Path("scripts/test-r31-empty-error-shots.ts")
t = p.read_text(encoding="utf-8")
t = t.replace("assert.equal(R31_AI_SHOT_NAMES.length, 6)", "assert.equal(R31_AI_SHOT_NAMES.length, 7)")
t = t.replace(
    "console.log('test-r31-empty-error-shots: ok', R31_AI_SHOT_NAMES.length)",
    "const conflict = shots.find((s) => s.name === 'r31-model-missing-vs-prod-narrow')\n"
    "assert.ok(conflict?.steps?.some((st) => st.op === 'aiModelMissing'))\n"
    "console.log('test-r31-empty-error-shots: ok', R31_AI_SHOT_NAMES.length)",
)
# Also remove the botched >=6 lines if present
t = t.replace("assert.ok(R31_AI_SHOT_NAMES.length >= 6)\nassert.ok(R31_AI_SHOT_NAMES.includes('r31-empty-narrow'))\n", "")
p.write_text(t, encoding="utf-8")
print("fixed")
print(p.read_text(encoding="utf-8")[:600])
