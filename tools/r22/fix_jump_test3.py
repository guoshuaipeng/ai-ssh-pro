from pathlib import Path
p = Path("scripts/test-ai-jump-from-audit.ts")
t = p.read_text(encoding="utf-8")
t2 = t.replace(
    "assert.ok(panel.includes('buildAuditOpenAiMissToast') || panel.includes(\"tg('au2.openAiMiss')\"))\nassert.ok(panel.includes('au2.openAiMiss'))\n",
    "assert.ok(panel.includes('buildAuditOpenAiMissToast'))\nassert.ok(panel.includes('miss.messageKey'))\nassert.ok(norm('src/shared/ai-audit-miss.ts').includes('au2.openAiMiss'))\n",
)
if t2 == t:
    # try alternate escaping
    import re
    t2, n = re.subn(
        r"assert\.ok\(panel\.includes\('buildAuditOpenAiMissToast'\).*?\nassert\.ok\(panel\.includes\('au2\.openAiMiss'\)\)\n",
        "assert.ok(panel.includes('buildAuditOpenAiMissToast'))\nassert.ok(panel.includes('miss.messageKey'))\nassert.ok(norm('src/shared/ai-audit-miss.ts').includes('au2.openAiMiss'))\n",
        t,
        count=1,
        flags=re.S,
    )
    print("regex n", n)
p.write_text(t2, encoding="utf-8")
print("updated")
print(p.read_text(encoding="utf-8")[700:1200])
