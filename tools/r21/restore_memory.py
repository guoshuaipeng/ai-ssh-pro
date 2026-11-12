# -*- coding: utf-8 -*-
from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
pt = panel.read_text(encoding="utf-8")
if "aria-label={`${tg('wm.memory')} · ${memoryView.count}`}" not in pt:
    pt = pt.replace(
        "                  aria-controls=\"ai-memory-pop\"\n                  title={memoryView.summaryLine || tg('wm.memoryTitle')}",
        "                  aria-controls=\"ai-memory-pop\"\n                  aria-label={`${tg('wm.memory')} · ${memoryView.count}`}\n                  title={memoryView.summaryLine || tg('wm.memoryTitle')}",
        1,
    )
    panel.write_text(pt, encoding="utf-8")
    print("aria restored")
else:
    print("aria already")

css = ROOT / "src/renderer/src/styles.css"
ct = css.read_text(encoding="utf-8")
old = """@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 100%;
    flex-basis: 100%;
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
if old in ct:
    css.write_text(ct.replace(old, new, 1), encoding="utf-8")
    print("css restored")
elif "R21: memory chip ultra-narrow" in ct:
    print("css already r21")
else:
    raise SystemExit('css anchor missing')

pkg = ROOT / "package.json"
pk = pkg.read_text(encoding="utf-8")
if "test-r21-memory-chip-narrow" not in pk:
    pk = pk.replace(
        "scripts/test-r21-failure-evidence.ts\"",
        "scripts/test-r21-failure-evidence.ts && npx tsx --tsconfig tsconfig.web.json scripts/test-r21-memory-chip-narrow.ts\"",
        1,
    )
    pkg.write_text(pk, encoding="utf-8")
    print("pkg restored")
else:
    print("pkg already")
