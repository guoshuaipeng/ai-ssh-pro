from pathlib import Path
p = Path("scripts/test-r25-ai-shot-harness.ts")
t = p.read_text(encoding="utf-8")
needle = "assert.ok(panel.includes('shot-r22-next') || panel.includes('shot-r21-fail'))"
insert = needle + """
assert.ok(/planStepDisplayMax/.test(panel))
assert.ok(/import \\{[\\s\\S]*planStepDisplayMax[\\s\\S]*\\} from '@shared\\/ai-suggestion-steps'/.test(panel))"""
if "import \\{[\\s\\S]*planStepDisplayMax" in t:
    print("already")
elif needle not in t:
    raise SystemExit("needle missing")
else:
    p.write_text(t.replace(needle, insert, 1), encoding="utf-8")
    print("updated")
