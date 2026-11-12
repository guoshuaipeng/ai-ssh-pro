# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\src\main\ai-interactive-agent.ts")
t = p.read_text(encoding="utf-8")
old = "          let failedBudget = failure ? observeRetryBudget(1, failure.command) : null\n          if (failure && requestId) {"
new = "          let failedBudget: ReturnType<typeof observeRetryBudget> | null = null\n          if (failure && requestId) {"
if old not in t:
    raise SystemExit('marker missing: ' + repr(old[:60]))
p.write_text(t.replace(old, new, 1), encoding="utf-8")
print('budget init fixed')
