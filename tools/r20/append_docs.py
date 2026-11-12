# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

retro = """
## Round 20 — 2026-11-05（工作记忆可见性 + R19 截图债）
- 计划：约 30 分钟；1 高频：AI 面板工作记忆/观测证据可见（诚实、非 dump）+ 1 小打磨：扩 harness 拍 policy-menu-open / pending-dock-narrow → `docs/screenshots/r20/`；编码前 UX；附 R17–R20 过程复盘（逢约 6 轮节奏下的里程碑）。
- 实际：本机两项交付；Core-A 34/34；held-out H01–H08 绿；截图 4/4 expect true（需 rebuild，`--no-build` 首跑红）。
- 卡住点：① `--no-build` 时 out/ 缺 R19 `is-open` / `data-r19-narrow` 与 App `aiComposerPop` 开面板 → expect 全红；② PowerShell 内联正则仍易炸 → 继续 `tools/r20/*.py`。
- 根因/预防：截图矩阵依赖 HEAD 进 `out/`；Rxx harness 交付默认带一次 electron-vite build（或明确注明需 rebuild）；新面板态 IPC（snapshot）与 UI 裁剪函数同 commit。
- UX 验收：主 CTA 仍是发送/Agree；「记忆 · n」次要披露；无证据不渲染；绑定 persistKey；中文标签「主机线索/观测/近令」；≤3×48 字。
- 验收：`test-r20-memory-visibility` / `test-r20-ai-shot-harness` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r20/` dark/light × 2。
- 提交：`46d50b9a`（记忆可见）、`c9ff7306`（截图矩阵）。

### 过程复盘（R17–R20，里程碑）
- 节奏：每轮约 35–55 分钟；均 1 高频 + 1 小打磨；本地 commit、不推远程。
- 主题链：R17 审计↔对话回跳 → R18 计划步对齐 → R19 策略/确认坞触控窄栏 → R20 记忆可见 + 截图债收口。
- 返工：R19 视觉债（policy-open / pending-narrow）拖到 R20 才进 harness；首跑 `--no-build` 失败说明「矩阵绿 ≠ out/ 绿」。
- 重复 3+ 次：① PowerShell 引号 → `.py` 补丁已成默认；② 真机宽窄×深浅口头债 → 应用 declarative matrix 收口（R14–R20 模式）；③ 新 op 必须同步 App 开面板 + AIPanel stash + hooks 类型 + matrix JSON。
- 抽象已落地：`ai-shot-matrix-rXX.mjs` config-driven；`buildMemoryEvidenceView` 纯函数裁剪；继续沿用。
- 下轮候选：失败证据卡 / 记忆芯片窄栏真机抽检 / Roadmap 迭代 3 前扫对话缺口；整页视觉审计目标 Round 21。
"""

rp = ROOT / "docs/retro.md"
rt = rp.read_text(encoding="utf-8")
if "Round 20 — 2026-11-05" not in rt:
    # prepend after any leading title if present, else append at top of recent section
    # append near end of recent rounds (file grows downward historically — earlier rounds append at end of recent block)
    # Looking at structure: newest rounds are appended after older ones toward the middle/end of recent section.
    # Prior pattern: append at beginning after searching for Round 19 block end, or append before "# Backlog" if in same file.
    # retro.md is separate from backlog.md based on earlier read - Round 19 was at end of retro.
    rp.write_text(rt.rstrip() + "\n" + retro, encoding="utf-8")
    print("retro appended")
else:
    print("retro already")

backlog = """
## 2026-11-05 Round 20 追加
- 已完成：AI 面板 **工作记忆/观测证据可见**（`记忆 · n` 芯片 + 最多 3 条主机线索/观测/近令；`ai:workingMemory:snapshot` + `buildMemoryEvidenceView`）；R19 债截图进矩阵 → `docs/screenshots/r20/`（policy-menu-open / pending-dock-narrow）。
- P2：真机宽窄×深浅仍欠（R6–R19 遗留；R20 harness 已覆盖本轮两态）；记忆芯片在极窄栏与目标行争宽——可再收（ellipsis / 仅 count）。
- P2（R17 遗留）：审计「对话」无匹配时仅 toast——弱提示「在当前主机新开对话」但不造历史。
- P1 候选 Round 21：保持 AI 对话——**失败证据卡**（命令失败后把证据钉在卡内，对齐 Core-A S27 可见性）/ 或整页视觉审计（逢 3 轮目标）/ 或记忆芯片窄栏再收；默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 20 UX 验收（编码后）
- 主 CTA：发送 / Agree 不变；记忆芯片为次要披露，不抢 CTA。
- 绑定：snapshot 与 goal 同 `persistKey`；新对话/清空清 evidence。
- 空/错：无证据不渲染「记忆 · 0」；不做「没有匹配」空态。
- 矩阵：`docs/screenshots/r20/README.md`（policy-open / pending-dock-narrow）。
- 守卫：`test-r20-memory-visibility` / `test-r20-ai-shot-harness`；Core-A 34/34；held-out H01–H08 绿。
"""

bp = ROOT / "docs/backlog.md"
bt = bp.read_text(encoding="utf-8")
if "Round 20 追加" not in bt:
    # insert near top after title / first heading content — prior rounds prepend after "# Backlog..."
    marker = "# Backlog（2026-10-20 第 9 轮之后，按日常使用频率排序）\n"
    if marker in bt:
        bp.write_text(bt.replace(marker, marker + "\n" + backlog, 1), encoding="utf-8")
    else:
        bp.write_text(backlog + "\n" + bt, encoding="utf-8")
    print("backlog prepended")
else:
    print("backlog already")

print("docs done")
