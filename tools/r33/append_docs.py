# -*- coding: utf-8 -*-
from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

retro_block = """
## Round 33 — 2026-11-05（逢 3 轮整页视觉审计：miss→新开对话 / EN Ask chip）
- 计划：约 30 分钟；1 高频：宽窄×深浅整页审计（含 R32 miss→新开对话、EN Ask chip）入 backlog 并修 1–2 快 P2；1 小打磨：审计头名快修；编码前 UX。
- 实际：~45 分钟；两项各一提交 + docs/截图；Core-A 34/34 + held-out 全绿；r33 截图 12/12 expect true。
- 卡住点：① miss toast expect 首跑红——`demoHost` 残留「已添加并打开演示主机」toast 抢 `querySelector` 首位；② 须 `clearToasts()` 后再 `showToast`，expect 改 `querySelectorAll`。
- 根因：截图矩阵开 demo 主机必出 info toast；miss 矩阵若不清栈，断言会打到错误 toast。
- 预防：凡 `toasts:true` 的 AI 态截图，op 内先 `clearToasts()`；expect 按文案/动作筛选，勿假定栈顶唯一。
- 验收：`test-r33-visual-audit-toast` / `test-r33-miss-en-chip-shots` + 接线 R31/R32；Core-A 34/34；held-out 全绿；`docs/screenshots/r33/`。
- 提交：`4ffcc351`（审计+toast wrap）、`1d2b0606`（矩阵+locale/aiMissToast+截图）；docs 同轮。
- 逢 3 轮整页视觉：本轮完成（上一拍 Round 30）→ **下一目标 Round 36**。
"""

backlog_block = """
## 2026-11-05 Round 33 追加
- **逢 3 轮整页视觉审计完成**（设计 `docs/design/r33-full-page-visual-audit.md`）：扫层级/空错态/窄栏/miss→新开对话/EN Ask；发现入表并修快 P2。
- **已完成**：toast 长文案 wrap + `toast-action`；miss toast / EN Ask chip（+safety pop）截图矩阵 `docs/screenshots/r33/` 12/12；`locale` + `aiMissToast` ops；miss op 内 `clearToasts()`。
- **已完成**：`package.json` `test:parts` 补接线 R31/R32/R33。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R33）。
- P3：pending Decline 权重 / 策略 pop 标题窄栏两行 / EN Ask 口语同形 — 可接受。
- P1 候选 Round 34：保持 AI 对话——composer EN chip 真机抽检后的中文策略菜单对照 / 或失败钉+记忆同屏再收一档 / 或 Roadmap 迭代 3 前对话缺口再扫（端口转发仍默认不接）。
- 下一整页视觉目标：**Round 36**。

### Round 33 UX 验收（编码后）
- 主 CTA：miss toast = 新开对话；待确认仍 Agree；失败钉仍「带证据重试」；chip 短标签 Ask ≠ Agree。
- 绑定：locale 截图 op 只改本窗；新开对话仍绑当前主机；clearToasts 不碰会话历史。
- 空/错：miss toast ≠ demoHost toast ≠ filter-empty。
- 守卫：`test-r33-*` + R31/R32；Core-A 34/34；held-out H01–H08 绿；截图 12/12。
"""

# retro prepend
retro = ROOT / "docs/retro.md"
rt = retro.read_text(encoding="utf-8")
if "Round 33 —" not in rt:
    lines = rt.splitlines(keepends=True)
    i = 0
    for idx, line in enumerate(lines):
        if line.startswith("## Round"):
            i = idx
            break
    else:
        i = 1 if lines else 0
    lines.insert(i, retro_block.lstrip("\n") + "\n")
    retro.write_text("".join(lines), encoding="utf-8", newline="\n")
    print("retro ok")
else:
    print("retro already")

bl = ROOT / "docs/backlog.md"
bt = bl.read_text(encoding="utf-8")
if "2026-11-05 Round 33 追加" not in bt:
    # insert after the Round 33 audit table if present, else front
    marker = "## Round 33 全页轻量视觉审计"
    if marker in bt:
        # insert after the audit table block (before next ## that isn't Round 33 audit continuation)
        # simplest: prepend round-33 追加 after audit table — find end of table section
        idx = bt.find(marker)
        # find next ## 2026 or ## Round that is not this audit
        rest = bt[idx:]
        # place 追加 right after audit table section: after first blank line following ok row
        insert_at = bt.find("\n## ", idx + len(marker))
        if insert_at < 0:
            bt = backlog_block.lstrip("\n") + "\n" + bt
        else:
            bt = bt[:insert_at] + "\n" + backlog_block.lstrip("\n") + bt[insert_at:]
    else:
        bt = backlog_block.lstrip("\n") + "\n" + bt
    bl.write_text(bt, encoding="utf-8", newline="\n")
    print("backlog ok")
else:
    print("backlog already")

# append after-code to design
design = ROOT / "docs/design/r33-full-page-visual-audit.md"
d = design.read_text(encoding="utf-8")
if "## After code" not in d:
    d += """
## After code
- Item1 `4ffcc351`: visual-audit design/backlog table; toast message wrap + `toast-action` testid.
- Item2 `1d2b0606`: `locale` / `aiMissToast` ops; clear prior toasts; matrix `docs/screenshots/r33/` 12/12 expect true; wire R31–R33 into `test:parts`.
- Docs: retro Round 33; next full-page **Round 36**.
- Round 34 suggestion: AI-dialog — EN/zh policy chip对照抽检, or failure-pin+memory hierarchy polish, or pre–iter-3 dialog gap rescan (port-forward deferred).
"""
    design.write_text(d, encoding="utf-8", newline="\n")
    print("design after-code ok")
else:
    print("design already")

print("docs done")
