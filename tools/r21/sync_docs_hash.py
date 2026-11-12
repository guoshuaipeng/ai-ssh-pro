# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\docs\retro.md")
t = p.read_text(encoding="utf-8")
t = t.replace("`575f3ff0`（docs/审计）", "`1858cabe`（docs/审计）", 1)
p.write_text(t, encoding="utf-8")
print("hash synced")
