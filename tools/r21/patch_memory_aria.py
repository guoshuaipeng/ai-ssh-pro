# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\src\renderer\src\components\AIPanel.tsx")
t = p.read_text(encoding="utf-8")
old = """                <button
                  type="button"
                  className={`ai-memory-chip${memoryOpen ? ' is-open' : ''}`}
                  data-testid="ai-memory-chip"
                  aria-expanded={memoryOpen}
                  aria-controls="ai-memory-pop"
                  title={memoryView.summaryLine || tg('wm.memoryTitle')}
                  onClick={() => setMemoryOpen((v) => !v)}
                >
                  <span className="ai-memory-chip-label">{tg('wm.memory')}</span>
                  <span className="ai-memory-chip-count" data-testid="ai-memory-count">
                    · {memoryView.count}
                  </span>
                </button>
"""
new = """                <button
                  type="button"
                  className={`ai-memory-chip${memoryOpen ? ' is-open' : ''}`}
                  data-testid="ai-memory-chip"
                  aria-expanded={memoryOpen}
                  aria-controls="ai-memory-pop"
                  aria-label={`${tg('wm.memory')} · ${memoryView.count}`}
                  title={memoryView.summaryLine || tg('wm.memoryTitle')}
                  onClick={() => setMemoryOpen((v) => !v)}
                >
                  <span className="ai-memory-chip-label">{tg('wm.memory')}</span>
                  <span className="ai-memory-chip-count" data-testid="ai-memory-count">
                    · {memoryView.count}
                  </span>
                </button>
"""
if 'aria-label={`${tg(\'wm.memory\')} · ${memoryView.count}`}' not in t and 'aria-label={`${tg("wm.memory")} · ${memoryView.count}`}' not in t:
    if old not in t:
        # try softer match
        if 'data-testid="ai-memory-chip"' in t and 'aria-label={`${tg(\'wm.memory\')}' not in t:
            t2 = t.replace(
                '                  data-testid="ai-memory-chip"\n                  aria-expanded={memoryOpen}\n                  aria-controls="ai-memory-pop"\n                  title={memoryView.summaryLine || tg(\'wm.memoryTitle\')}',
                '                  data-testid="ai-memory-chip"\n                  aria-expanded={memoryOpen}\n                  aria-controls="ai-memory-pop"\n                  aria-label={`${tg(\'wm.memory\')} · ${memoryView.count}`}\n                  title={memoryView.summaryLine || tg(\'wm.memoryTitle\')}',
                1,
            )
            if t2 == t:
                raise SystemExit('memory chip block not found')
            t = t2
        else:
            raise SystemExit('unexpected memory chip state')
    else:
        t = t.replace(old, new, 1)
    p.write_text(t, encoding='utf-8')
    print('aria-label added')
else:
    print('aria already')
