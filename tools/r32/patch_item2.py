# -*- coding: utf-8 -*-
"""R32 item2: EN policy chip short labels Ask/Suggest/Auto + i18n consistency."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

def write(path: Path, text: str):
    path.write_text(text.replace("\r\n", "\n"), encoding="utf-8", newline="\n")

i18n = ROOT / "src/renderer/src/lib/i18n.tsx"
t = i18n.read_text(encoding="utf-8")
# Only the EN chip ask label — keep zh and menu full names.
old = "'policy.chip.ask': 'Confirm',"
new = "'policy.chip.ask': 'Ask',"
# Ensure we only hit EN block: EN appears after zh. Count occurrences.
count = t.count(old)
if count != 1:
    # Maybe already patched or different quoting
    if "'policy.chip.ask': 'Ask'," in t and count == 0:
        print("already Ask")
    else:
        raise SystemExit(f"unexpected chip.ask Confirm count={count}")
else:
    t = t.replace(old, new, 1)
    write(i18n, t)
    print("EN policy.chip.ask → Ask")

# Verify matrix in file
t = i18n.read_text(encoding="utf-8")
# Extract roughly: find zh chip block and en chip block via unique neighbors
checks = [
    ("'policy.chip.suggest': '仅建议',", True),
    ("'policy.chip.ask': '需确认',", True),
    ("'policy.chip.auto': '自动',", True),
    ("'policy.chip.suggest': 'Suggest',", True),
    ("'policy.chip.ask': 'Ask',", True),
    ("'policy.chip.auto': 'Auto',", True),
    ("'policy.ask': 'Confirm before run',", True),
    ("'policy.suggest': 'Suggest only',", True),
    ("'policy.auto': 'Auto run',", True),
]
for s, _ in checks:
    if s not in t:
        raise SystemExit(f"missing expected i18n: {s}")
print("i18n matrix ok")

# Update R19 test
r19 = ROOT / "scripts/test-r19-policy-menu-touch.ts"
r = r19.read_text(encoding="utf-8")
r2 = r.replace(
    "assert.equal(translate('en', 'policy.chip.ask'), 'Confirm')",
    "assert.equal(translate('en', 'policy.chip.ask'), 'Ask')\n"
    "assert.equal(translate('en', 'policy.chip.suggest'), 'Suggest')\n"
    "assert.equal(translate('en', 'policy.chip.auto'), 'Auto')",
)
if r2 == r:
    if "policy.chip.ask'), 'Ask'" in r:
        print("r19 already updated")
    else:
        raise SystemExit("r19 Confirm assert not found")
else:
    write(r19, r2)
    print("updated test-r19")

# Dedicated consistency test
write(ROOT / "scripts/test-r32-en-policy-chip.ts", r'''/** R32: EN policy chip short labels + zh/en consistency (not CTA-like Confirm). */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { translate } from '../src/renderer/src/lib/i18n'

const norm = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')

// Visible chip shorts — single words; EN Ask matches policy id (not Agree CTA "Confirm").
assert.equal(translate('zh-CN', 'policy.chip.suggest'), '仅建议')
assert.equal(translate('zh-CN', 'policy.chip.ask'), '需确认')
assert.equal(translate('zh-CN', 'policy.chip.auto'), '自动')
assert.equal(translate('en', 'policy.chip.suggest'), 'Suggest')
assert.equal(translate('en', 'policy.chip.ask'), 'Ask')
assert.equal(translate('en', 'policy.chip.auto'), 'Auto')

// Menu / settings keep full names
assert.equal(translate('zh-CN', 'policy.suggest'), '仅建议')
assert.equal(translate('zh-CN', 'policy.ask'), '执行前确认')
assert.equal(translate('zh-CN', 'policy.auto'), '自动执行')
assert.equal(translate('en', 'policy.suggest'), 'Suggest only')
assert.equal(translate('en', 'policy.ask'), 'Confirm before run')
assert.equal(translate('en', 'policy.auto'), 'Auto run')

// Short hints exist both locales
for (const k of ['policy.suggestShort', 'policy.askShort', 'policy.autoShort'] as const) {
  assert.ok(translate('zh-CN', k).length > 4, k)
  assert.ok(translate('en', k).length > 4, k)
}

// Chip must not equal Agree-like CTA wording in EN
assert.notEqual(translate('en', 'policy.chip.ask'), 'Confirm')
assert.notEqual(translate('en', 'policy.chip.ask'), translate('en', 'policy.ask'))

const panel = norm('src/renderer/src/components/AIPanel.tsx')
assert.ok(panel.includes("tg(`policy.chip.${aiPolicy.effective}`"))
assert.ok(panel.includes('data-testid="ai-safety-chip-label"'))
assert.ok(panel.includes('data-chip-short='))
// aria/title use full effective policy name via policyChipTitle
assert.ok(panel.includes('policyChipTitle'))
assert.ok(panel.includes("tg(`policy.${aiPolicy.effective}`"))

const i18n = norm('src/renderer/src/lib/i18n.tsx')
for (const k of ['policy.chip.suggest', 'policy.chip.ask', 'policy.chip.auto', 'policy.suggest', 'policy.ask', 'policy.auto']) {
  assert.equal(i18n.split(`'${k}':`).length - 1, 2, `${k} zh+en`)
}

console.log('test-r32-en-policy-chip: ok')
''')
print("wrote test-r32-en-policy-chip.ts")
print("item2 ok")
