# -*- coding: utf-8 -*-
from pathlib import Path
from datetime import datetime

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

retro = """
## Round 21 — 2026-11-05（失败证据卡 + 记忆芯片窄栏 + 逢 3 轮全页视觉审计）
- 计划：约 30 分钟；1 高频：确认命令失败后钉证据卡（对齐 S27）+ 1 小打磨：记忆芯片极窄收／或整页视觉审计入 backlog；编码前 UX。
- 实际：本机两项代码 + docs 视觉审计；Core-A 34/34；held-out H01–H08 绿。
- 卡住点：① exec 原先先 emit 再 classify → 改为先 classify 再带 failureKind/evidence/retryBudget；② PowerShell 仍用 `tools/r21/*.py`；③ ExecReplay 注释含 confirmStep 词触发守卫误报。
- 根因/预防：失败可见性要以 UI 钉住为准，不能只靠 end description；流事件字段与 normalizeExecRecord / 历史持久化同 commit；守卫断言避开注释里的禁词。
- UX 验收：失败卡主 CTA「带证据重试」= 新提问，不写 SSH；预算用尽 → 填入输入框「换个问法」；记忆芯片 ≤230px 仅 count + aria。
- 验收：`test-r21-failure-evidence` / `test-r21-memory-chip-narrow` + Core-A 34/34 + held-out 全绿。
- 提交：`ad36c3f4`（失败证据）、`3274c6da`（记忆窄栏）。
"""

rp = ROOT / "docs/retro.md"
rt = rp.read_text(encoding="utf-8")
if "Round 21 — 2026-11-05" not in rt:
    rp.write_text(rt.rstrip() + "\n" + retro, encoding="utf-8")
    print("retro ok")
else:
    print("retro already")

backlog = """
## 2026-11-05 Round 21 追加
- 已完成：确认命令失败后 **失败证据卡**（钉在回复卡；`failureKind`/`evidence`/`retryBudget`；中文「命令失败 / 不会自动重跑 · 重试须新的确认 / 带证据重试」；对齐 S27，无静默重跑）；记忆芯片极窄仅 count + aria（R20 P2）。
- P2：真机宽窄×深浅仍欠（R6–R20 遗留）；失败证据卡 / 记忆 count-only 可扩进 harness（`aiFailureEvidence` op 已接线）。
- P2（R17 遗留）：审计「对话」无匹配时仅 toast——弱提示「在当前主机新开对话」但不造历史。
- P1 候选 Round 22：保持 AI 对话——把 `aiFailureEvidence` 纳入截图矩阵 / 或失败卡与下一张确认卡的步骤高亮联动 / 或 Roadmap 迭代 3 前扫对话缺口（审计无匹配弱提示）；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 21 全页轻量视觉审计（逢 3 轮，R14–R20 矩阵 + AI 面板 chrome）→ backlog
依据：`docs/screenshots/r14|r17|r18|r20` README 矩阵与当前 AI 面板结构（未新开 Electron 全量重拍；本轮以既有矩阵 + 代码审查）。

| 级别 | 问题 | 建议 |
|------|------|------|
| P2 | 失败证据卡为本轮新态，矩阵尚未收录 `aiFailureEvidence` 宽/窄×深/浅 | Round 22 扩 harness → `docs/screenshots/r22/` |
| P2 | 记忆芯片 count-only（≤230px）与目标行同排：极窄时 `·n` 与主机 chip 间距是否够点按（≥24px） | 真机触控抽检；不足则加大 hit padding |
| P2 | 审计「对话」无匹配仍仅 toast（R17） | 弱提示「在当前主机新开对话」，不造历史 |
| P2 | 真机宽/窄×深/浅全量矩阵仍口头债（R6 起） | 继续 declarative matrix 收口，勿再口头延期 |
| P3 | 失败卡与 ExecReplay 状态行并存时，失败钉 +「失败 · exit」双报可能略吵 | 失败钉存在时弱化 exec 状态行或默认折叠 |
| P3 | 策略 pop 标题「AI 执行策略（此标签页）」窄栏两行（R19 已记） | 可接受；若仍挤则短标题 |
| P3 | 英文 chip Confirm/Suggest/Auto 与菜单全称并存（R19） | 真机确认不混淆即可 |
| P3 | pending 三按钮 Agree/Decline/审计在 280px 折行后 Decline 权重（R19） | 可再降 Decline 一档 |

### Round 21 UX 验收（编码后）
- 主 CTA：失败卡「带证据重试」；预算用尽「换个问法」不写 SSH；待确认仍是 Agree。
- 绑定：evidence/budget 属本卡 command/requestId/会话主机。
- 空/错：非 failed 不渲染钉；无证据不 CTA。
- 窄栏：失败 actions 折行；记忆 label 隐藏。
- 守卫：`test-r21-failure-evidence` / `test-r21-memory-chip-narrow`；Core-A 34/34；held-out H01–H08 绿。
"""

bp = ROOT / "docs/backlog.md"
bt = bp.read_text(encoding="utf-8")
if "Round 21 追加" not in bt:
    marker = "# Backlog（2026-10-20 第 9 轮之后，按日常使用频率排序）\n"
    if marker in bt:
        bp.write_text(bt.replace(marker, marker + "\n" + backlog, 1), encoding="utf-8")
    else:
        bp.write_text(backlog + "\n" + bt, encoding="utf-8")
    print("backlog ok")
else:
    print("backlog already")

# Ensure design exists
design = ROOT / "docs/r21-design.md"
if not design.exists():
    raise SystemExit('design missing')
print("design present")
