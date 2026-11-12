# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

retro_block = """
## Round 32 — 2026-11-05（迭代 3 前 AI 对话缺口扫 + EN 策略芯片短标签）
- 计划：约 30 分钟；1 高频：Roadmap 迭代 3 前再扫 AI 对话缺口并交付最高影响项（端口转发不接）；1 小打磨：EN policy chip 短标签 / i18n 一致性；编码前 UX。
- 实际：~35 分钟；两项各一提交 + design/retro/backlog；Core-A 34/34 + held-out H01–H08 全绿。
- Gap scan：Iter 2（2.1–2.5）与 H01–H08 已齐。最高影响未做 = 审计→对话未命中仍只有「回到顶部」（R17/R22 债）。其次 EN chip「Confirm」像 CTA 与 Agree 撞车；真机 Tauri 矩阵 / Decline 权重可接受。
- 卡住点：miss toast 的 useEffect 写在 `startNewChat` 之前 → 用 `startNewChatRef` 接线，不整段搬 hook。
- 根因：R22 只把 miss 从 error 改成 info+scroll，未落到「本主机新开对话」恢复路径；EN 短标签沿用 Confirm 与菜单全称/同意按钮语义重叠。
- 预防：深链 miss 必须给可执行恢复（新开对话），禁止只滚动；chip 短标签用状态词/策略 id（Ask），勿用 Agree 动词。
- 验收：`test-r32-audit-miss-new-chat` / `test-r32-en-policy-chip` + R19/R22/jump；Core-A 34/34；held-out 全绿。
- 提交：`00015dd8`（miss→新开对话）、`3447db18`（EN chip Ask/Suggest/Auto）；docs 同轮。
- 下一整页视觉目标：**Round 33**。
"""

backlog_block = """
## 2026-11-05 Round 32 追加
- **Gap scan（Roadmap 迭代 3 前）**：2.1–2.5 + H01–H08 已交付；最高影响缺口 = 审计→对话 miss 仅「回到顶部」→ 本轮改为「新开对话」。其余：EN chip Confirm CTA 撞车（本轮 Ask）、真机 Tauri 矩阵 P2、Decline/pop 标题 P3；端口转发仍不接。
- **已完成**：miss toast 动作「新开对话 / New chat」→ `startNewChat`（归档现有；不编造匹配历史）；文案提示可在本主机新开。
- **已完成**：EN `policy.chip.*` = Ask / Suggest / Auto；菜单全称不变；aria/title 仍用完整 `policy.*` + source。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R31）。
- P3：pending Decline 权重 / 策略 pop 标题窄栏两行 — 可接受。
- P1 候选 Round 33：**逢 3 轮整页视觉审计**（上一拍 Round 30）——AI 对话整页扫层级/空错态/窄栏/深链 miss 新开对话 / EN chip Ask；发现入 backlog。默认不接端口转发。
- 下一整页视觉目标：**Round 33（本轮注明，下轮执行）**。

### Round 32 UX 验收（编码后）
- 主 CTA：miss toast 动作 = 新开对话；待确认仍 Agree；失败钉仍「带证据重试」。
- 绑定：新开对话绑当前主机/会话 key；不切标签、不伪造历史行。
- 空/错：miss ≠ filter-empty ≠ true-empty；chip 短标签 ≠ Agree。
- 守卫：`test-r32-audit-miss-new-chat` / `test-r32-en-policy-chip`；Core-A 34/34；held-out H01–H08 绿。
"""

retro = ROOT / "docs/retro.md"
rt = retro.read_text(encoding="utf-8")
if "Round 32 —" not in rt:
    # Prepend after title if any, else front
    if rt.startswith("#"):
        # insert after first heading line
        lines = rt.splitlines(keepends=True)
        # find first ## Round
        i = 0
        for idx, line in enumerate(lines):
            if line.startswith("## Round"):
                i = idx
                break
        else:
            i = 1 if lines else 0
        lines.insert(i, retro_block.lstrip("\n") + "\n")
        retro.write_text("".join(lines), encoding="utf-8", newline="\n")
    else:
        retro.write_text(retro_block.lstrip("\n") + "\n" + rt, encoding="utf-8", newline="\n")
    print("retro prepended")
else:
    print("retro already has R32")

bl = ROOT / "docs/backlog.md"
bt = bl.read_text(encoding="utf-8")
if "Round 32 追加" not in bt:
    bl.write_text(backlog_block.lstrip("\n") + "\n" + bt, encoding="utf-8", newline="\n")
    print("backlog prepended")
else:
    print("backlog already has R32")

print("docs ok")
