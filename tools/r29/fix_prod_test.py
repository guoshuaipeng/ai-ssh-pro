from pathlib import Path
p = Path("scripts/test-prod-auto-hint.ts")
t = p.read_text(encoding="utf-8")
old = '''assert.ok(panel.includes("protection === 'production'"))
assert.ok(panel.includes('elevated && protection ==='))
assert.equal(panel.includes("level: production ? 'production' : 'normal'"), false, 'panel must not use flattened production prop for banner')
assert.equal(panel.includes('paused: false'), false, 'panel must pass elevate pause into prodAutoHint')
'''
new = '''assert.ok(panel.includes("protectionForUi === 'production'"))
assert.ok(panel.includes('elevated && protectionForUi ==='))
assert.equal(panel.includes("level: production ? 'production' : 'normal'"), false, 'panel must not use flattened production prop for banner')
assert.equal(panel.includes('paused: false'), false, 'panel must pass elevate pause into prodAutoHint')
assert.ok(panel.includes('screenshotProtectionOverride ?? protection'), 'banner uses raw protection + elevate')
'''
assert old in t, 'anchor missing'
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print("prod-auto test fixed")
