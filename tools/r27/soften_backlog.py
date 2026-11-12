# -*- coding: utf-8 -*-
"""Split backlog Round 27 so item1 doesn't claim polish done yet; finalize after commits via append."""
from pathlib import Path
b = Path("docs/backlog.md")
t = b.read_text(encoding="utf-8")
old = """## 2026-11-05 Round 27 追加
- 已完成：逢 3 轮整页视觉审计入 backlog；记忆展开触控命中 ≥32px。
- 已完成：jump-audit 种子匹配审计行后重拍 → `docs/screenshots/r27/`（见 polish 提交）。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R27）。
- P1 候选 Round 28：保持 AI 对话——Roadmap 迭代 3 前扫对话缺口 / 或策略 Decline 权重 / 或过滤-empty 故意态进矩阵；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。
- 下一整页视觉目标：**Round 30**。

"""
new = """## 2026-11-05 Round 27 追加
- 已完成：逢 3 轮整页视觉审计入 backlog；记忆展开触控命中 ≥32px（对照 list-row 32）。
- （polish）jump-audit 种子匹配审计行后重拍 → `docs/screenshots/r27/`。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R27）。
- P1 候选 Round 28：保持 AI 对话——Roadmap 迭代 3 前扫对话缺口 / 或策略 Decline 权重 / 或 filter-empty 故意态进矩阵；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。
- 下一整页视觉目标：**Round 30**。

"""
if old in t:
    t = t.replace(old, new, 1)
    b.write_text(t, encoding="utf-8")
    print("backlog softened")
else:
    print("backlog pattern missing or already soft")
