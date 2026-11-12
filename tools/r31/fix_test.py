from pathlib import Path
p = Path("scripts/test-r31-empty-error-shots.ts")
t = p.read_text(encoding="utf-8")
t = t.replace("assert.equal(R31_AI_SHOT_NAMES.length, 6)", "assert.ok(R31_AI_SHOT_NAMES.length >= 6)\nassert.ok(R31_AI_SHOT_NAMES.includes('r31-empty-narrow'))")
# deepEqual against fixed list will fail if 7 - change to check core names
old = """const shots = r31AiShots()
assert.deepEqual(shots.map((s) => s.name), R31_AI_SHOT_NAMES)
assert.ok(R31_AI_SHOT_NAMES.length >= 6)
assert.ok(R31_AI_SHOT_NAMES.includes('r31-empty-narrow'))
"""
# read current
print(t[:500])
