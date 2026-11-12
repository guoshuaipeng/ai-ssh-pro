from pathlib import Path
p = Path("scripts/test-ai-jump-from-audit.ts")
t = p.read_text(encoding="utf-8")
old = '''assert.ok(panel.includes("tg('au2.openAiMiss')"))'''
new = '''assert.ok(panel.includes('buildAuditOpenAiMissToast') || panel.includes("tg('au2.openAiMiss')"))
assert.ok(panel.includes('au2.openAiMiss'))'''
if old not in t:
    raise SystemExit('assert not found')
p.write_text(t.replace(old, new, 1), encoding="utf-8")
# also expand i18n key check for new action key
old2 = '''for (const k of ['au2.openAi', 'au2.openAiTip', 'au2.openAiMiss']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
}'''
new2 = '''for (const k of ['au2.openAi', 'au2.openAiTip', 'au2.openAiMiss', 'au2.openAiMissAction']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
}'''
t = p.read_text(encoding="utf-8")
if old2 not in t:
    raise SystemExit('i18n loop not found')
p.write_text(t.replace(old2, new2, 1), encoding="utf-8")
print('jump test updated')
