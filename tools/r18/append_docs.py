# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

retro_block = """
## Round 18 — 2026-11-05（计划步对齐 suggestionStepNo + 审计↔对话截图矩阵）
- 计划：约 30 分钟；1 高频：进度芯片 / 确认卡高亮 / 「步骤 n」共用 suggestionStepNo；1 小打磨：双向深链补进截图矩阵。
- 实际：本机完成两项；Core-A 34/34；held-out H01–H08 绿；r18 截图 8/8 expect true。
- 卡住点：① agent `runProgress.step` 与可见建议卡序号本就不是同一坐标系（snapshot/end 占 loop）；② held-out H07 把 `action === 'command' || …` 绑在 panel 字符串上，抽 shared 后要改 wiring 而非硬绕。
- 根因/预防：UI 步号以 `buildSuggestionStepNos` 为源，`alignPlanStepDisplay` 在有待确认卡时优先 suggestion；新 screenshot op 同步 hooks + App 开面板列表 + AIPanel stash/replay + matrix JSON。
- UX 验收：主 CTA 仍是 Agree；芯片/badge/`ai-step-index` 同 n；审计「对话」与 ExecReplay「审计」对称；空匹配仍 toast（R17 债未扩）。
- 验收：`test-r18-plan-step-align` / `test-r18-ai-shot-harness` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r18/` dark/light × 4 态。
- 提交：`c3550de0`（对齐）、`a64d52dc`（矩阵）。

"""

retro = ROOT / "docs" / "retro.md"
rt = retro.read_text(encoding="utf-8")
if "Round 18 — 2026-11-05" not in rt:
    # prepend near top after any leading title? append at end is fine like R17
    retro.write_text(rt.rstrip() + "\n" + retro_block, encoding="utf-8")
    print("retro appended")
else:
    print("retro already has R18")

backlog_block = """## 2026-11-05 Round 18 追加
- 已完成：计划步与 `suggestionStepNo` 对齐（`alignPlanStepDisplay`；芯片 `data-aligned-step` / badge 与「步骤 n」一致）；审计↔对话双向深链进截图矩阵 → `docs/screenshots/r18/`（plan-step-align / ai-to-audit / audit-to-ai / audit-open-ai）。
- P2：真机宽窄×深浅仍欠（R6–R17 遗留，harness 已覆盖 R18 态）；审计「对话」无匹配时仅 toast——可考虑弱提示「在当前主机新开对话」但不造历史（R17 债）。
- P2（R15 遗留）：窄栏策略芯片「执行前确认」ellipsis 后触控/无悬停可读性——图标-only + aria-label 候选。
- P1 候选 Round 19：保持 AI 对话——composer 策略菜单触控可读（R15）/ 或确认坞与计划进度在窄栏再收一档 / 或 Roadmap 迭代 3 前扫对话缺口（工作记忆可见性、失败证据卡）；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 18 UX 验收（编码后）
- 主 CTA：待确认仍是 Agree；步号只是进度标注，不抢按钮。
- 绑定：对齐步号属本轮 pendingConfirm 卡片；深链审计 id / 命令仍绑当前主机会话。
- 空/错：无匹配审计→对话仍 toast（未改 R17）；截图态用 `screenshotAuditFocusId` 保持高亮，不替代真跳转。
- 矩阵：`docs/screenshots/r18/README.md`。

"""

backlog = ROOT / "docs" / "backlog.md"
bt = backlog.read_text(encoding="utf-8")
if "Round 18 追加" not in bt:
    # insert after the first heading block — put at top of dated appendices
    marker = "## 2026-11-05 Round 17 追加"
    if marker in bt:
        backlog.write_text(bt.replace(marker, backlog_block + marker, 1), encoding="utf-8")
    else:
        backlog.write_text(backlog_block + bt, encoding="utf-8")
    print("backlog prepended")
else:
    print("backlog already has R18")
