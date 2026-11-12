# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\docs\retro.md")
t = p.read_text(encoding="utf-8")
old = "- 提交：`ad36c3f4`（失败证据）、`3274c6da`（记忆窄栏）。"
new = "- 提交：`ad36c3f4`（失败证据）、`3274c6da`（记忆窄栏）、`575f3ff0`（docs/审计）。"
if old not in t:
    raise SystemExit("commit line missing: " + repr(old))
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print("updated")
