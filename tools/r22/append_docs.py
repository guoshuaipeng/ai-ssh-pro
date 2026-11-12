# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

retro = ROOT / "docs/retro.md"
retro_text = retro.read_text(encoding="utf-8")
entry = """
## Round 22 — 2026-11-05（失败证据截图矩阵 + 下一步确认联动 / 审计未匹配弱提示）
- 计划：约 30 分钟；1 高频：扩 harness 拍 `aiFailureEvidence` 宽/窄×深/浅 → `docs/screenshots/r22/`；1 小打磨：失败卡↔下一步确认高亮 + R17 审计空匹配弱 toast；编码前 UX。
- 实际：本机两项交付；Core-A 34/34；held-out H01–H08 绿；截图 6/6 expect true（含 next-confirm 联动态）。
- 卡住点：① 首跑 expect 全红——R21 shot handler 误调截图作用域外的 `setTurnPending`（ReferenceError）；② `test-ai-jump-from-audit` 仍断言裸 `tg('au2.openAiMiss')`，改为 helper 后需同步夹具。
- 根因/预防：截图 handler 只能用面板顶层 state setter；新 toast/文案抽 shared helper 时同步改旧 wiring 断言；Rxx harness 默认 rebuild。
- UX 验收：失败主 CTA「带证据重试」；「下一步待确认」次要；确认坞 Agree 仍是唯一主 CTA；审计 miss = info +「回到顶部」，非 error 红。
- 验收：`test-r22-ai-shot-harness` / `test-r22-failure-next-confirm` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r22/` dark/light × failure / failure-narrow / failure-next-confirm。
- 提交：`529385b5`（矩阵+修 setTurnPending）、`39eb23cd`（联动+弱 toast）。
"""
if "Round 22 — 2026-11-05" not in retro_text:
    # insert after Round 21 block header area — append near top of recent rounds
    anchor = "## Round 21 — 2026-11-05"
    if anchor in retro_text:
        retro.write_text(retro_text.replace(anchor, entry.strip() + "\n\n" + anchor, 1), encoding="utf-8")
    else:
        # try Chinese style
        anchor2 = "## 2026-11-05 Round 21"
        if "Round 21" in retro_text:
            # prepend to file after first heading if needed
            retro.write_text(entry.strip() + "\n\n" + retro_text, encoding="utf-8")
        else:
            retro.write_text(retro_text + "\n" + entry, encoding="utf-8")
    print("retro appended")
else:
    print("retro already")

backlog = ROOT / "docs/backlog.md"
bt = backlog.read_text(encoding="utf-8")
bl = """
## Round 22 收口（AI 对话）
- 已完成：`aiFailureEvidence` 纳入截图矩阵（宽/窄×深/浅 + next-confirm 联动态）；失败卡「下一步待确认」→ 确认坞高亮；审计空匹配改为冷静 info toast +「回到顶部」。
- P2：失败钉存在时弱化 ExecReplay「失败 · exit」双报（R21 视觉债仍在）。
- P2：真机 Tauri 宽窄矩阵仍欠（Electron harness 已覆盖 R14–R22 主态）。
- P3：失败→下一步按钮文案「下一步待确认 · 当前第 n/max 步」在极窄栏可能略长——可再收成「下一步 · n」。
- P1 候选 Round 23：保持 AI 对话——**失败钉与 ExecReplay 状态行去重** / 或 **带证据重试后自动滚到新确认卡** / 或 Roadmap 迭代 3 对话缺口扫（模型预设后续步、流式 partial 引用失败证据）。
"""
if "Round 22 收口" not in bt:
    # insert near top after title or after Round 21 section
    if "## Round 21" in bt or "Round 21" in bt[:3000]:
        # find first ## after start
        idx = bt.find("## Round 21")
        if idx < 0:
            idx = bt.find("- 已完成：确认命令失败")
        if idx >= 0:
            bt = bt[:idx] + bl.strip() + "\n\n" + bt[idx:]
        else:
            bt = bl.strip() + "\n\n" + bt
    else:
        bt = bl.strip() + "\n\n" + bt
    backlog.write_text(bt, encoding="utf-8")
    print("backlog appended")
else:
    print("backlog already")

# update design note lightly
design = ROOT / "docs/design/r22-ai-failure-harness.md"
dt = design.read_text(encoding="utf-8")
if "After code" not in dt:
    design.write_text(dt + "\n## After code\n- Item1 `529385b5`: matrix green after removing out-of-scope `setTurnPending`.\n- Item2 `39eb23cd`: next-confirm link + audit miss helper; 6/6 shots green.\n", encoding="utf-8")
    print("design updated")
print("docs done")
