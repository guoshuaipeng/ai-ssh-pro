from pathlib import Path
p = Path("scripts/test-ai-jump-from-audit.ts")
t = p.read_text(encoding="utf-8")
old = """assert.ok(panel.includes('buildAuditOpenAiMissToast') || panel.includes(\"tg('au2.openAiMiss')\"))
assert.ok(panel.includes('au2.openAiMiss'))"""
new = """assert.ok(panel.includes('buildAuditOpenAiMissToast'))
assert.ok(panel.includes('miss.messageKey') || panel.includes('miss.actionKey'))
assert.ok(norm('src/shared/ai-audit-miss.ts').includes(\"au2.openAiMiss\"))"""
# read current
print("CURRENT ASSERT REGION:")
idx = t.find("buildAuditOpenAiMissToast")
print(repr(t[idx-50:idx+250]))
