# -*- coding: utf-8 -*-
"""Split R25 working tree into two clean commits."""
from pathlib import Path
import subprocess
import shutil

ROOT = Path(__file__).resolve().parents[2]

def run(cmd):
    print("+", " ".join(cmd))
    subprocess.check_call(cmd, cwd=ROOT)

panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
full_panel = panel.read_text(encoding="utf-8")
(ROOT / "tools/r25/AIPanel.full.tsx").write_text(full_panel, encoding="utf-8")

# Rebuild item1 panel: HEAD content + planStepDisplayMax import only
head = subprocess.check_output(["git", "show", "HEAD:src/renderer/src/components/AIPanel.tsx"], cwd=ROOT)
head_t = head.decode("utf-8")
old = """import {
  alignPlanStepDisplay,
  buildSuggestionStepNos,
  collectSuggestionCommands,
  findConfirmableLineIndex,
  formatSuggestionCommandsForCopy
} from '@shared/ai-suggestion-steps'
"""
new = """import {
  alignPlanStepDisplay,
  buildSuggestionStepNos,
  collectSuggestionCommands,
  findConfirmableLineIndex,
  formatSuggestionCommandsForCopy,
  planStepDisplayMax
} from '@shared/ai-suggestion-steps'
"""
if old not in head_t:
    raise SystemExit("HEAD import block unexpected")
item1_panel = head_t.replace(old, new, 1)
# HEAD already uses planStepDisplayMax in body (R24) — import was the miss
panel.write_text(item1_panel, encoding="utf-8")
print("panel: item1 (import only)")

# package.json: only harness for item1
pkg = ROOT / "package.json"
pkg_full = pkg.read_text(encoding="utf-8")
(ROOT / "tools/r25/package.full.json").write_text(pkg_full, encoding="utf-8")
# Start from HEAD package and add only harness
pkg_head = subprocess.check_output(["git", "show", "HEAD:package.json"], cwd=ROOT).decode("utf-8")
needle = 'scripts/test-r24-next-confirm-short.ts"'
insert = 'scripts/test-r24-next-confirm-short.ts && npx tsx --tsconfig tsconfig.web.json scripts/test-r25-ai-shot-harness.ts"'
if "test-r25-ai-shot-harness" in pkg_head:
    pkg_item1 = pkg_head
else:
    pkg_item1 = pkg_head.replace(needle, insert, 1)
pkg.write_text(pkg_item1, encoding="utf-8")
print("pkg: item1")

# styles/i18n/shared should be HEAD for item1 (memory is item2)
for rel in [
    "src/renderer/src/styles.css",
    "src/renderer/src/lib/i18n.tsx",
    "src/shared/working-memory-view.ts",
]:
    run(["git", "checkout", "HEAD", "--", rel])

print("ready for item1 commit")
