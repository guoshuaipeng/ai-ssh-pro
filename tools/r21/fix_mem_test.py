# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\scripts\test-r21-memory-chip-narrow.ts")
t = p.read_text(encoding='utf-8')
t = t.replace(
    "assert.ok(panel.includes('aria-label={`${tg(\\'wm.memory\\')} · ${memoryView.count}`}') || panel.includes(\"aria-label={`${tg('wm.memory')} · ${memoryView.count}`}\"))",
    "assert.ok(panel.includes(\"aria-label={`${tg('wm.memory')} · ${memoryView.count}`}\"))",
)
p.write_text(t, encoding='utf-8')
print('memory test assert fixed')
print(p.read_text(encoding='utf-8'))
