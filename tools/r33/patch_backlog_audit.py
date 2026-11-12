# -*- coding: utf-8 -*-
"""R33: prepend full-page audit table to backlog (item1)."""
from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
bl = ROOT / "docs/backlog.md"
bt = bl.read_text(encoding="utf-8")
block = """## Round 33 全页轻量视觉审计（逢 3 轮，R30 后下一拍；R14–R32 矩阵 + 代码审查）→ backlog
依据：`docs/screenshots/r14|r30|r31` 与 R32 miss→新开对话 / EN Ask chip 代码（Electron harness；未新开 Tauri 真机全量）。

| 级别 | 问题 | 处置 |
|------|------|------|
| P2 | R32 miss→新开对话 + EN Ask chip 未进截图矩阵 | 本轮 `docs/screenshots/r33/` |
| P2 | 长 miss toast 文案 + 动作按钮：message 缺 `min-width:0` | 本轮 toast wrap + `toast-action` |
| P2 | `test-r31-*` / `test-r32-*` 未接入 `package.json` `test:parts` | 本轮一并接线 |
| P2 | 真机 Tauri 宽/窄×深/浅全量矩阵仍口头债（R6 起） | 继续 declarative matrix；勿再口头延期 |
| P3 | pending Decline 权重 / 策略 pop 标题窄栏两行 | 可接受 |
| P3 | EN chip「Ask」与口语 ask 同形——R32 有意避开 Confirm CTA | 可接受；矩阵固化 Ask/Suggest/Auto |
| ok | 双横幅互斥；model-missing 藏横幅；miss→startNewChat；chip 短标签 zh/en | R29–R32 已做 |

"""
if "Round 33 全页轻量视觉审计" not in bt:
    bl.write_text(block + bt, encoding="utf-8", newline="\n")
    print("backlog audit table prepended")
else:
    print("backlog already has R33 audit")
