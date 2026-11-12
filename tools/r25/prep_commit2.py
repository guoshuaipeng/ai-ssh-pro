# -*- coding: utf-8 -*-
from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[2]

# Restore full panel (import + memory)
full = (ROOT / "tools/r25/AIPanel.full.tsx").read_text(encoding="utf-8")
(ROOT / "src/renderer/src/components/AIPanel.tsx").write_text(full, encoding="utf-8")
print("panel restored")

# Re-apply item2 patches for shared/i18n/css/test/pkg by re-running patch_item2
# But panel is already full; patch_item2 may skip panel. Re-run carefully.
import subprocess
# Re-apply shared/i18n/css via patch_item2 — it checks "already"
# First restore pkg to include both tests from package.full.json
pkg_full = (ROOT / "tools/r25/package.full.json").read_text(encoding="utf-8")
(ROOT / "package.json").write_text(pkg_full, encoding="utf-8")
print("pkg full restored")

subprocess.check_call(["python", "tools/r25/patch_item2.py"], cwd=ROOT)
print("item2 reapplied")
