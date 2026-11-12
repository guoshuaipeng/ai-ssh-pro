# -*- coding: utf-8 -*-
"""Fix R27 CSS order: must win over R25 28px rules."""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]
css = ROOT / "src/renderer/src/styles.css"
c = css.read_text(encoding="utf-8")

# Remove misplaced R27 block if before R26
bad = """
/* R27 Round27: memory expand touch hit (visual audit P2) */
.ai-panel .ai-memory-close {
  min-height: 32px;
}
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn {
  min-height: 32px;
}
.ai-panel .ai-memory-chip {
  min-height: 32px;
}

"""
c = c.replace(bad, "")

# Also bump R25 values in place (source of truth) + keep R27 marker after R25 block
# Update R25 min-height 28px for close and jump-btn to 32px
c2 = c
c2 = c2.replace(
    """.ai-panel .ai-memory-close {
  flex: 0 0 auto;
  min-height: 28px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--fs-xs);
}""",
    """.ai-panel .ai-memory-close {
  flex: 0 0 auto;
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
  font-size: var(--fs-xs);
}""",
    1,
)
c2 = c2.replace(
    """  width: 100%;
  min-height: 28px;
  margin: 0;
  padding: var(--space-1) 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn:hover,""",
    """  width: 100%;
  min-height: 32px;
  margin: 0;
  padding: var(--space-1) 0;
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.ai-panel .ai-memory-item.is-jumpable .ai-memory-jump-btn:hover,""",
    1,
)

marker = "/* R27 Round27: memory expand touch hit (visual audit P2) */"
if marker not in c2:
    # Append after R25 jump-label hover block — before ai-header-shortcut
    anchor = ".ai-panel .ai-header-shortcut kbd {"
    block = """/* R27 Round27: memory expand touch hit (visual audit P2) */
/* Wins over earlier 28px; chip matches list-row touch. */
.ai-panel .ai-memory-chip {
  min-height: 32px;
}

"""
    if anchor not in c2:
        raise SystemExit("header shortcut anchor missing")
    c2 = c2.replace(anchor, block + anchor, 1)

# Verify no 28px left on those selectors in R25 region
r25 = c2.find("/* R25 Round25: working-memory expand UX */")
head = c2.find(".ai-panel .ai-header-shortcut kbd {", r25)
chunk = c2[r25:head]
if "min-height: 28px" in chunk:
    raise SystemExit("still 28px in R25 memory chunk:\n" + chunk)
if "R27 Round27" not in c2:
    raise SystemExit("R27 marker missing")

css.write_text(c2, encoding="utf-8")
print("css fixed: R25→32px + R27 chip")
