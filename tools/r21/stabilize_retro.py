# -*- coding: utf-8 -*-
from pathlib import Path
import re
p = Path(r"E:\pythonProjects\ai-ssh-pro\docs\retro.md")
t = p.read_text(encoding="utf-8")
t2, n = re.subn(
    r"- 提交：`ad36c3f4`（失败证据）、`3274c6da`（记忆窄栏）、`[^`]+`（docs/审计）。",
    "- 提交：`ad36c3f4`（失败证据）、`3274c6da`（记忆窄栏）；docs 同轮 `docs: Round 21 retro + full-page visual audit backlog`。",
    t,
    count=1,
)
if n != 1:
    raise SystemExit(f"n={n}")
p.write_text(t2, encoding="utf-8")
print("stabilized")
