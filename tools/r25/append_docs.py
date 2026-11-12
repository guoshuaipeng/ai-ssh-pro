# -*- coding: utf-8 -*-
from pathlib import Path

backlog = Path("docs/backlog.md")
b = backlog.read_text(encoding="utf-8")
section = """
## 2026-11-05 Round 25 追加
- 已完成：失败证据截图矩阵扩「下一步 · n」态 → `docs/screenshots/r25/`（宽/窄 × 深/浅 × failure / next-confirm；expect 校验 `data-aligned-step=2` + 短文案）；顺带修 R24 漏 import 的 `planStepDisplayMax`（next-confirm 截图路径会崩）。
- 已完成：工作记忆展开 UX——芯片触控 ≥28px；弹层「收起」；近令行跳转审计（全文 `query` 筛选，不执行命令）。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R25）；记忆展开态可另扩 harness 拍 close/jump。
- P3：hostFact/observation 仍只读（不跳审计）— 可接受；极窄 count-only 与主机 chip 间距真机抽检可关。
- P1 候选 Round 26：保持 AI 对话——记忆展开态进截图矩阵 / 或 Roadmap 迭代 3 前扫对话缺口（失败钉+记忆同屏层级、审计空筛选冷静文案）；默认不接端口转发。整页视觉目标仍 Round 27。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 25 UX 验收（编码后）
- 主 CTA：失败钉仍「带证据重试」；「下一步 · 2」次要；Agree 唯一确认主 CTA；记忆仍是次要披露。
- 绑定：next-confirm `data-aligned-step` 与计划芯片同源；近令审计筛选绑当前主机标签。
- 空/错：无证据不渲染记忆芯片；审计无匹配沿用既有冷静空态，不造「没有匹配」误用。
- 守卫：`test-r25-ai-shot-harness` / `test-r25-memory-expand`；Core-A 34/34；held-out H01–H08 绿；截图 8/8。

"""
if "Round 25 追加" not in b:
    marker = "## 2026-11-05 Round 24 追加"
    if marker in b:
        b = b.replace(marker, section + marker, 1)
    else:
        b = section + b
    backlog.write_text(b, encoding="utf-8")
    print("backlog: R25 appended")
else:
    print("backlog: already")

retro = Path("docs/retro.md")
r = retro.read_text(encoding="utf-8")
retro_section = """
## Round 25 — 2026-11-05（失败「下一步 · n」截图矩阵 + 工作记忆展开 UX）
- 计划：约 30 分钟；1 高频：失败证据矩阵补短「下一步 · n」/narrow；1 小打磨：记忆触控/收起/近令跳审计；编码前 UX。
- 实际：~40 分钟；两项各一提交 + docs；Core-A 34/34 + held-out 全绿；r25 截图 8/8。
- 卡住点：① 首跑 next-confirm expect 红——R24 用了 `planStepDisplayMax` 但 AIPanel **未 import**（静态守卫漏检）；② PowerShell 内联引号 → `tools/r25/*.py`。
- 根因：R24 wiring 测试只 assert 源码字符串含 helper 名，不校验 import 绑定；截图路径才暴露 ReferenceError。
- 预防：凡新增 shared helper 用于 JSX，harness/守卫须断言 `import {… helper …} from`；Rxx 截图默认 rebuild。
- 验收：`test-r25-ai-shot-harness` / `test-r25-memory-expand` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r25/`。
- 提交：`d423b291`（矩阵+import 修）、`07335696`（记忆展开）；docs 同轮。
- 逢 3 轮整页视觉：上一拍 Round 24 → **下一目标 Round 27**。

"""
if "Round 25 — 2026-11-05" not in r:
    marker = "## Round 24 — 2026-11-05"
    if marker in r:
        r = r.replace(marker, retro_section + marker, 1)
    else:
        r = retro_section + r
    retro.write_text(r, encoding="utf-8")
    print("retro: R25 appended")
else:
    print("retro: already")

# Append after-code note to design
design = Path("docs/design/r25-failure-next-memory.md")
d = design.read_text(encoding="utf-8")
if "## After code" not in d:
    d += """

## After code
- Item1 `d423b291`: matrix 8/8 green after fixing missing `planStepDisplayMax` import.
- Item2 `07335696`: chip ≥28px; 「收起」; 近令 → audit filter via `query`.
"""
    design.write_text(d, encoding="utf-8")
    print("design: after-code")
else:
    print("design: already")
