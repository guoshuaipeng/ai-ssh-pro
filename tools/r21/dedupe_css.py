# -*- coding: utf-8 -*-
from pathlib import Path
p = Path(r"E:\pythonProjects\ai-ssh-pro\src\renderer\src\styles.css")
t = p.read_text(encoding='utf-8')
dup = """
/* R21: memory chip ultra-narrow — count only, label in title/aria */
@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 4.5rem;
    flex: 0 0 auto;
    flex-basis: auto;
  }
  .ai-panel .ai-memory-chip-label {
    display: none;
  }
  .ai-panel .ai-memory-chip-count {
    flex: 0 0 auto;
  }
  .ai-panel .ai-memory-chip-count::before {
    content: none;
  }
}

/* R20 Round20: working-memory / observational evidence (honest, not a dump) */
"""
keep = """
/* R20 Round20: working-memory / observational evidence (honest, not a dump) */
"""
if dup not in t:
    raise SystemExit('dup block missing')
t = t.replace(dup, keep, 1)
# Ensure remaining @container has R21 comment
old = """@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 4.5rem;
    flex: 0 0 auto;
    flex-basis: auto;
  }
  .ai-panel .ai-memory-chip-label {
    display: none;
  }
}
"""
new = """/* R21: memory chip ultra-narrow — count only, label via aria-label/title */
@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 4.5rem;
    flex: 0 0 auto;
    flex-basis: auto;
  }
  .ai-panel .ai-memory-chip-label {
    display: none;
  }
  .ai-panel .ai-memory-chip-count {
    flex: 0 0 auto;
  }
}
"""
if old not in t:
    raise SystemExit('remaining container missing')
t = t.replace(old, new, 1)
p.write_text(t, encoding='utf-8')
print('css deduped')
