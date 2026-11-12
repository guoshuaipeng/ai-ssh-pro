# -*- coding: utf-8 -*-
from pathlib import Path
import subprocess
p = Path(r"E:\pythonProjects\ai-ssh-pro\docs\retro.md")
h = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=p.parent.parent, text=True).strip()
t = p.read_text(encoding="utf-8")
import re
t2, n = re.subn(
    r"- 提交：`ad36c3f4`（失败证据）、`3274c6da`（记忆窄栏）、`[^`]+`（docs/审计）。",
    f"- 提交：`ad36c3f4`（失败证据）、`3274c6da`（记忆窄栏）、`{h}`（docs/审计）。",
    t,
    count=1,
)
if n != 1:
    raise SystemExit(f"replace count {n}")
p.write_text(t2, encoding="utf-8")
print("set to", h)
