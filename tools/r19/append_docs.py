# -*- coding: utf-8 -*-
from pathlib import Path
from datetime import datetime

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# Append design post-review
design = ROOT / "docs/r19-design.md"
post = """

## UX review (post-code)
- Hierarchy: Agree remains sole primary on pending dock; policy chip short label is status chrome; menu option for effective policy is the selection CTA.
- Binding: chip/menu still resolveAiPolicy for this tab; dock still pendingConfirm on current conversation.
- Narrow: chip 需确认/仅建议/自动 never mystery-ellipsis; options 40px + links 32px + is-open/focus-visible without hover; dock stacks at 280px; streak wraps under run-steps at 230px.
- Empty/error: needSession note + need-session CTA unchanged.
- Verify on device: open policy menu with keyboard only; touch option height; narrow pending Agree+Decline+审计 wrap; ask-policy active badge + composer 第 n/max.
"""
txt = design.read_text(encoding="utf-8")
if "UX review (post-code)" not in txt:
    design.write_text(txt.rstrip() + post, encoding="utf-8")

# Prepend backlog
backlog = ROOT / "docs/backlog.md"
head = """## 2026-11-05 Round 19 追加
- 已完成：composer 策略芯片短中文（需确认/仅建议/自动）+ 菜单触控/焦点（R15 债；`is-open`、打开聚焦当前项、40px option / 32px link）；确认坞 + 计划进度窄栏再收一档（pending dock `@container` 280px 堆叠、预览 2 行、badge/streak ellipsis）。
- P2：真机宽窄×深浅仍欠（R6–R18 遗留；R19 态可扩 harness：policy-menu-open / pending-dock-narrow）。
- P3（本轮轻扫，非整页审计——下一次整页在 Round 21）：safety pop 标题「AI 执行策略（此标签页）」在极窄仍可能两行——可接受；英文 chip Confirm/Suggest/Auto 与菜单全称并存需真机确认不混淆；pending 三按钮（Agree/Decline/审计）在 280px 折行后 Decline 次级权重可再降一档。
- P1 候选 Round 20：保持 AI 对话——扩 R14 harness 拍 policy-open + pending-dock 窄态 / 或 Roadmap 迭代 3 前扫对话缺口（工作记忆可见性、失败证据卡）；或英文 chip 短标签抽检。默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 19 UX 验收（编码后）
- 主 CTA：待确认仍是 Agree；策略菜单选当前生效项；短标签不抢 CTA。
- 绑定：策略/确认坞均绑本标签页会话。
- 空/错：无会话仍 needSession / need-session CTA。
- 守卫：`test-r19-policy-menu-touch` / `test-r19-confirm-dock-narrow`；Core-A 34/34；held-out H01–H08 绿。

"""
bt = backlog.read_text(encoding="utf-8")
if "Round 19 追加" not in bt:
    backlog.write_text(head + bt, encoding="utf-8")

# Append retro
retro = ROOT / "docs/retro.md"
entry = """
## Round 19 — 2026-11-05（策略菜单触控可读 + 确认坞/计划进度窄栏）
- 计划：约 30 分钟；1 高频 R15 债（composer 策略菜单触控/无悬停可读）+ 1 小打磨确认坞与计划进度窄栏再收；编码前 UX 评审。
- 实际：本机两项交付；Core-A 34/34；held-out H01–H08 绿；真机矩阵仍欠。
- 卡住点：PowerShell 内联引号易炸 → 继续 `tools/r19/*.py`；`package.json` 接线同法。
- 根因/预防：窄栏 ellipsis 长中文（执行前确认）在无悬停设备变成谜 → 芯片用短标签、全称留给 aria/title/菜单；触控目标与 focus-visible 必须不依赖 :hover；确认坞应用自己的 `container-type` 而不是假定 `.ai-panel` 是 container。
- 验收：`test-r19-policy-menu-touch` / `test-r19-confirm-dock-narrow` + Core-A 34/34 + held-out 全绿；提交 `d5fe6cb5` / `a8f87455`。
- 逢 3 轮整页视觉：本轮非整页（上一整页债在 R18 节奏，下一目标 Round 21）；本轮轻扫记入 backlog P3。
"""
rt = retro.read_text(encoding="utf-8")
if "Round 19 — 2026-11-05" not in rt:
    retro.write_text(rt.rstrip() + "\n" + entry, encoding="utf-8")

print("docs updated")
