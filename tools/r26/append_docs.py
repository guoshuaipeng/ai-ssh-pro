# -*- coding: utf-8 -*-
from pathlib import Path

backlog = Path("docs/backlog.md")
b = backlog.read_text(encoding="utf-8")
section = """
## 2026-11-05 Round 26 追加
- 已完成：记忆展开态进截图矩阵 → `docs/screenshots/r26/`（宽/窄 × 深/浅 × open / collapsed / jump-audit；`aiMemoryEvidence.open|jumpAudit`）。
- 已完成：失败钉同屏时记忆芯片进一步 muted（`:has(ai-failure-evidence)`）；审计「真·无记录」与「有筛选无命中」分开——冷静「没有符合筛选的记录」+「清空筛选」。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R26）；jump-audit 在空审计库仍走 true-empty（有事件无命中才 filter-empty）— 可在 R27 种子一条审计再重拍。
- P3：`aiFailureEvidence.withMemory` 仅截图/QA 用；host 深链筛选清空不改 tab host（可接受）。
- **Round 27 = 逢 3 轮整页视觉审计**（上一拍 Round 24）：AI 对话整页扫层级/空错态/窄栏，发现入 backlog；可选顺手种子审计后重拍 jump-audit filter-empty。
- P1 候选 Round 27 之外：保持 AI 对话——Roadmap 迭代 3 前扫对话缺口；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 26 UX 验收（编码后）
- 主 CTA：失败钉仍「带证据重试」；记忆仍次要；审计 filter-empty 主 CTA=清空筛选；true-empty 仍「了解审计…」。
- 绑定：近令跳转审计仍绑会话 host + 全文 query；清空筛选只清本地面板筛选。
- 空/错：禁止筛选无命中时误用「还没有审计记录」。
- 守卫：`test-r26-ai-shot-harness` / `test-r26-hierarchy-audit-empty`；Core-A 34/34；held-out H01–H08 绿；截图 12/12。

"""
if "Round 26 追加" not in b:
    marker = "## 2026-11-05 Round 25 追加"
    if marker in b:
        b = b.replace(marker, section + marker, 1)
    else:
        b = section + b
    backlog.write_text(b, encoding="utf-8")
    print("backlog: R26 appended")
else:
    print("backlog: already")

retro = Path("docs/retro.md")
r = retro.read_text(encoding="utf-8")
retro_section = """
## Round 26 — 2026-11-05（记忆展开截图矩阵 + 失败/记忆层级与审计空筛选）
- 计划：约 30 分钟；1 高频：记忆 open/collapse/jump-audit 进 `docs/screenshots/r26/`；1 小打磨：失败钉同屏记忆层级 + 审计 filter-empty 冷静文案；编码前 UX。
- 实际：~35 分钟；两项各一提交 + docs；Core-A 34/34 + held-out 全绿；r26 截图 12/12。
- 卡住点：① `test-ui-n6` 全仓 `var(--x, #)` 断言本就红（与 R26 无关，基线复现）；② PowerShell 引号 → `tools/r26/*.py`。
- 根因：ui-n6 扫整个 styles+features，历史 fallback 债未清；不应用本轮范围去「修全仓」。
- 预防：新 CSS 块仍禁 token fallback；全仓 ui-n6 债记 backlog 非整轮硬拦；Rxx 截图默认 rebuild。
- 验收：`test-r26-ai-shot-harness` / `test-r26-hierarchy-audit-empty` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r26/`。
- 提交：`2173bf19`（矩阵）、`0e2b6b88`（层级+空筛选）；docs 同轮。
- 逢 3 轮整页视觉：上一拍 Round 24 → **下一目标 Round 27（本轮注明，下轮执行）**。

"""
if "Round 26 — 2026-11-05" not in r:
    marker = "## Round 25 — 2026-11-05"
    if marker in r:
        r = r.replace(marker, retro_section + marker, 1)
    else:
        r = retro_section + r
    retro.write_text(r, encoding="utf-8")
    print("retro: R26 appended")
else:
    print("retro: already")

design = Path("docs/design/r26-memory-matrix-hierarchy.md")
d = design.read_text(encoding="utf-8")
if "## After code" not in d:
    d += """

## After code
- Item1 `2173bf19`: matrix 12/12 green (open / collapsed / jump-audit × dark/light × wide/narrow).
- Item2 `0e2b6b88`: memory muted beside failure pin; audit filter-empty ≠ true-empty.
- Round 27: full-page visual audit (AI dialog).
"""
    design.write_text(d, encoding="utf-8")
    print("design: after-code")
else:
    print("design: already")
