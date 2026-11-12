# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# design after-code
design = ROOT / "docs/design/r27-full-page-visual-audit.md"
d = design.read_text(encoding="utf-8")
if "## After code" not in d:
    d += """

## After code
- Item1 `9640ed06`: visual-audit backlog table + memory touch ≥32px; r26 tests wired into test:parts.
- Item2 `ae6209ad`: jumpAudit seeds matching audit row; `docs/screenshots/r27/` 8/8 expect true (jump-hit + failure/memory × dark/light × wide/narrow).
- Next full-page visual: **Round 30**. Round 28 suggestion: AI-dialog gap scan before Roadmap iter 3 / or intentional filter-empty matrix shot / Decline weight.
"""
    design.write_text(d, encoding="utf-8")
    print("design after-code")
else:
    print("design already")

# backlog polish mark
b = ROOT / "docs/backlog.md"
bt = b.read_text(encoding="utf-8")
bt2 = bt.replace(
    "- （polish）jump-audit 种子匹配审计行后重拍 → `docs/screenshots/r27/`。",
    "- 已完成：jump-audit 种子匹配审计行后重拍 → `docs/screenshots/r27/`（8/8 expect true）。",
    1,
)
if bt2 != bt:
    b.write_text(bt2, encoding="utf-8")
    print("backlog polish done")
else:
    print("backlog already final")

# retro
retro = ROOT / "docs/retro.md"
r = retro.read_text(encoding="utf-8")
section = """
## Round 27 — 2026-11-05（逢 3 轮整页视觉审计 + jump-audit 种子命中）
- 计划：约 30 分钟；1 高频：AI 面板整页视觉审计（宽窄×深浅 harness + 代码审查）入 backlog 并修 1–2 快 P2；1 小打磨：种子审计后重拍 jump-audit；编码前 UX。
- 实际：~40 分钟；两项各一提交 + docs/截图；Core-A 34/34 + held-out 全绿；r27 截图 8/8。
- 卡住点：① R27 CSS 若插在 R25 之前会被 `min-height: 28px` 盖掉 → 直接改 R25 源并在其后留 R27 marker；② package.json 缺 R26 测试接线（本轮一并补）；③ CopyToBox 截图路径仍在 allowed root 外（沿用 harness expect）。
- 根因：同选择器后写覆盖前写；逢 3 轮审计若不把「快 P2」当场修掉会口头债化。
- 预防：改触控尺寸改「定义处」而非仅追加；Rxx 截图默认 rebuild；jump 深链截图必须 seed 或显式拍 empty/filter-empty。
- 验收：`test-r27-visual-audit-touch` / `test-r27-seed-jump-audit` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r27/`。
- 提交：`9640ed06`（审计+触控）、`ae6209ad`（seed+矩阵）；docs 同轮。
- 逢 3 轮整页视觉：本轮完成（上一拍 Round 24）→ **下一目标 Round 30**。

"""
if "Round 27 — 2026-11-05" not in r:
    marker = "## Round 26 — 2026-11-05"
    if marker in r:
        r = r.replace(marker, section + marker, 1)
    else:
        r = section + r
    retro.write_text(r, encoding="utf-8")
    print("retro ok")
else:
    print("retro already")

# process note (lightweight — last process retro was R19–R24; note one line if useful)
proc = ROOT / "docs/process-note-r27.md"
proc.write_text(
    """# Process note — Round 27 (every-3 visual audit)

- Cadence held: R24 → R27 full-page AI audit; next R30.
- Reused declarative shot matrices (R14–R26) + code review instead of Tauri rebuild for acceptance; Electron harness still the default evidence channel.
- Abstraction reminder: deep-link screenshot states need **seeded data** (audit row / memory / failure pin) or an intentional empty expect — never claim a hit from an empty store.
- Wiring debt: R26 tests were green locally but missing from `package.json` test:parts until this round — every new `test-rXX` should land in test:parts in the same commit.
""",
    encoding="utf-8",
)
print("process note")

# optional tiny rule for dev-rules if under 15
rules = ROOT / "docs/dev-rules.md"
rt = rules.read_text(encoding="utf-8")
rule = "截图深链（jump-audit 等）必须 seed 匹配数据，或显式断言 empty/filter-empty；禁止空库冒充命中。"
if rule not in rt and "seed 匹配" not in rt:
    # keep ≤15 rules — append only if count low
    lines = [ln for ln in rt.splitlines() if ln.strip().startswith(("-", "1.", "2.", "3.", "4.", "5.", "6.", "7.", "8.", "9.")) or (ln.strip()[:2].isdigit() and "." in ln[:4])]
    # simpler: if file short enough
    if rt.count("\n- ") < 15 and "禁止空库" not in rt:
        if not rt.endswith("\n"):
            rt += "\n"
        rt += f"- {rule}\n"
        rules.write_text(rt, encoding="utf-8")
        print("dev-rules: seed deep-link")
    else:
        print("dev-rules: skip (cap)")
else:
    print("dev-rules: already")
