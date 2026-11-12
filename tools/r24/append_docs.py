# -*- coding: utf-8 -*-
from pathlib import Path

backlog = Path("docs/backlog.md")
b = backlog.read_text(encoding="utf-8")
section = """
## 2026-11-05 Round 24 追加
- 已完成：带证据重试后确认坞/芯片/可确认卡徽章共用 `alignPlanStepDisplay` + `planStepDisplayMax`；pending 时芯片仍可见；确认坞显示「当前第 n/max 步」。整页视觉审计后快捷修：失败→下一步改为「下一步 · n」。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R22；R24 未扩拍）。
- P2：记忆芯片 count-only ≤230px 与主机 chip 触控间距（R21 遗留）— 真机抽检。
- P3：pending 三按钮 Decline 权重（R19）；英文 chip 短标签 vs 菜单全称（R19）；极窄失败钉 + 安静状态行叠放（可接受）。
- P1 候选 Round 25：保持 AI 对话——失败证据卡进截图矩阵补「下一步 · n」态 / 或 Roadmap 迭代 3 前扫对话缺口（工作记忆展开交互、审计筛选记忆）；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 24 全页轻量视觉审计（逢 3 轮，R21 后下一拍）
| 优先级 | 发现 | 处置 |
| --- | --- | --- |
| ~~P1~~ | ~~重试后确认坞与计划芯片步号可能不一致~~ | ✅ R24 `d1baa4b1` dock/chip/badge 同源 |
| ~~P2~~ | ~~失败→下一步附带「当前第 n/max 步」窄栏过长（R22 P3）~~ | ✅ R24 `f6c76678` 「下一步 · n」 |
| P2 | 真机宽/窄×深/浅全量矩阵仍口头债（R6 起） | 继续 declarative matrix；勿再口头延期 |
| P2 | 记忆芯片 count-only 触控 hit（R21） | 真机抽检；不足则加大 padding |
| P3 | pending Decline 与 Agree 同权（R19） | 可再降 Decline 一档 |
| P3 | 英文 Confirm/Suggest/Auto vs 菜单全称 | 真机确认不混淆即可 |
| P3 | 极窄失败钉 + 安静 ExecReplay 行 | 可接受；若挤再折叠 quiet row |
| ok | R24 CSS 无 token fallback；失败钉主 CTA 仍是「带证据重试」 | — |

### Round 24 UX 验收（编码后）
- 主 CTA：待确认仍是 Agree；失败钉「带证据重试」；「下一步 · n」次要链接。
- 绑定：步号属本标签页 pendingConfirm；`data-aligned-step` 坞/芯片/徽章/链接一致。
- 空/错：无 pending 不画坞步号；无计划 fallback 1/1 不抢 CTA。
- 守卫：`test-r24-retry-plan-align` / `test-r24-next-confirm-short`；Core-A 34/34；held-out H01–H08 绿。

"""
if "Round 24 追加" not in b:
    # insert near top after first heading block if possible
    marker = "## 2026-11-05 Round 23 追加"
    if marker in b:
        b = b.replace(marker, section + marker, 1)
    else:
        b = section + b
    backlog.write_text(b, encoding="utf-8")
    print("backlog: R24 appended")
else:
    print("backlog: already")

retro = Path("docs/retro.md")
r = retro.read_text(encoding="utf-8")
retro_section = """
## Round 24 — 2026-11-05（重试步号对齐 + 逢 3 轮整页视觉 / 下一步短文案）
- 计划：约 30 分钟；1 高频：post-retry confirm ↔ plan-step chip；1 小打磨：整页视觉审计入 backlog + 修一处快 P2；附 R19–R24 过程复盘。
- 实际：~30 分钟；两项各一提交 + docs；Core-A 34/34 + held-out 全绿。
- 卡住点：① CopyToBox/Read 截图路径在 allowed root 外 → 改代码+harness 态审计；② R16/R18 wiring 断言需随 `planStepDisplayMax` / optional chaining 同步。
- 根因：R23 滚到确认坞后坞上无步号、芯片仅 `busy&&runProgress`、徽章仍 `suggestionStepNo.get(i)??` → 重试路径可短暂/持久不一致。
- 预防：凡 pending 路径坞/芯片/徽章强制 `alignedPlan`；新 helper 同步改旧 wiring 测试；逢 3 轮整页必须把可修 P2 当场修掉。
- 验收：`test-r24-retry-plan-align` / `test-r24-next-confirm-short` + Core-A 34/34 + held-out 全绿。
- 提交：`d1baa4b1`（对齐）、`f6c76678`（短文案）；docs 同轮。
- 逢 3 轮整页视觉：本轮完成（上一拍 Round 21）→ **下一目标 Round 27**。

### 过程复盘（R19–R24，逢约 6 轮）
- 节奏：每轮约 25–55 分钟；均 1 高频 + 1 小打磨；本地 commit、不推远程。
- 主题链：R19 策略/确认坞触控 → R20 记忆可见 → R21 失败证据+整页审计 → R22 失败矩阵/下一步 → R23 失败去重/重试滚动 → R24 重试步号对齐+整页审计。
- 返工：R22「下一步·activePlanStep」过长拖到 R24 才短文化；R18 步号对齐在重试路径仍有坞/芯片缺口 → R24 补齐说明「对齐」要覆盖所有 pending 表面。
- 重复 3+ 次：① PowerShell 引号 → `tools/rXX/*.py` 已成默认；② 真机宽窄×深浅口头债 → 应默认扩 matrix 而非每轮「待 rebuild」；③ 改 panel wiring 必同步旧 R16/R18 断言。
- 抽象已落地：`alignPlanStepDisplay` + `planStepDisplayMax`；`focusAiPendingAfterFailure`；config-driven shot matrix。继续沿用。
- 下轮候选：失败「下一步 · n」进 harness / 记忆展开交互 / Roadmap 迭代 3 前对话缺口；整页视觉目标 Round 27。

"""
if "Round 24 — 2026-11-05" not in r:
    # prepend after title or at end of recent
    marker = "## Round 23 — 2026-11-05"
    if marker in r:
        r = r.replace(marker, retro_section + marker, 1)
    else:
        r = retro_section + r
    retro.write_text(r, encoding="utf-8")
    print("retro: R24 appended")
else:
    print("retro: already")
