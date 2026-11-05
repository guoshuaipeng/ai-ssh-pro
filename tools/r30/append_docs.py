# -*- coding: utf-8 -*-
"""R30 docs: retro, process note R25–R30, design after-code, light dev-rules."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# --- retro prepend after title block ---
retro = ROOT / "docs/retro.md"
rt = retro.read_text(encoding="utf-8")
entry = """
## Round 30 — 2026-11-05（逢 3 轮整页视觉审计 + R25–R30 过程复盘）
- 计划：约 30 分钟；1 高频：AI 面板整页视觉审计（宽窄×深浅 / 双横幅 / 记忆·失败 / 空错）入 backlog 并修 1–2 快 P2；1 小打磨：审计头号快修 + 可选 prod↔readonly 对照截图；编码前 UX。
- 实际：~35 分钟；两项各一提交 + docs/截图；Core-A 34/34 + held-out 全绿；r30 截图 8/8 expect true。
- 卡住点：① CopyToBox 截图路径仍在 allowed root 外 → 代码审查 + harness expect（沿用 R24/R27）；② R14 prod 历来无窄栏对照，本轮一并补进 r30。
- 根因：双态安全横幅分属 R14/R29 文件夹，逢 3 轮审计若不对拍就难以验收「互斥 + 语气对称」；横幅触控高度未跟上 R27 记忆 32px 规则。
- 预防：同类互斥 UI 态（prod↔readonly）对照矩阵放同一 `docs/screenshots/rXX/`；新 chrome 条默认 `min-height: 32px` + 窄栏 `@container` 藏次要 hint。
- 验收：`test-r30-visual-audit-banner` / `test-r30-contrast-shots` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r30/`。
- 提交：`f2244676`（审计+触控/窄栏）、`a72ffe9c`（对照矩阵）；docs 同轮。
- 逢 3 轮整页视觉：本轮完成（上一拍 Round 27）→ **下一目标 Round 33**。

### 过程复盘（R25–R30，逢约 6 轮）
- 节奏：每轮约 25–45 分钟；均 1 高频 + 1 小打磨；本地 commit、不推远程。
- 主题链：R25 失败下一步/记忆展开 → R26 记忆矩阵+层级 → R27 整页审计+seed jump → R28 safetyContext/filter-empty → R29 只读横幅 → R30 整页审计+双横幅对照。
- 返工：R26 jump 空库冒充命中 → R27 seed；R14 prod 无窄栏拖到 R30 才对照；R29 测试接线已在 test:parts 中段（非链尾）——接线检查勿只扫文件末尾。
- 重复 3+ 次：① PowerShell 引号 → `tools/rXX/*.py`；② CopyToBox 截图根外 → harness expect；③ 逢 3 轮必须当场修可修 P2。
- 抽象已落地：declarative `ai-shot-matrix-rXX`；banner helpers `prodAutoHint` / `readonlyHostHint`；互斥 JSX。继续沿用。
- 下轮候选：空/错态窄栏矩阵 / Roadmap 迭代 3 对话缺口；整页视觉目标 Round 33；端口转发仍默认不接。

"""
if "Round 30 — 2026-11-05" not in rt:
    # insert after the intro paragraph / before first ##
    marker = "\n## "
    i = rt.find(marker)
    if i < 0:
        rt = entry + rt
    else:
        rt = rt[:i] + "\n" + entry + rt[i:]
    retro.write_text(rt, encoding="utf-8")
    print("retro ok")
else:
    print("retro already")

# --- process note ---
note = ROOT / "docs/process-note-r30.md"
note.write_text("""# Process note — Round 30 (every-3 visual audit + R25–R30 process)

- Cadence held: R27 → R30 full-page AI audit; next **R33**.
- Evidence channel: Electron declarative matrices (R14–R30); CopyToBox still blocked outside allowed root — harness `expect true` remains acceptance.
- Abstraction: put **mutually exclusive** chrome states (prod-auto ↔ readonly) in one contrast folder; do not leave them split across round folders when auditing.
- Touch rule spillover: R27 memory ≥32px → R30 host banners ≥32px; new reminder strips should ship with touch height + narrow `@container` hint collapse.
- Wiring: append `test-r30-*` next to latest r28/r29 in `test:parts` same commit; verify with Select-String, not only file-tail scan.
- Theme line R1–R30: **AI dialog safety + observability** — confirm/policy → stream stop → audit deep-link → plan steps → memory/failure evidence → host banners (prod/readonly) with every-3 visual audits.
""", encoding="utf-8")
print("process note ok")

# --- process retro file ---
pr = ROOT / "docs/process-retro-2026-11-05-r25-r30.md"
pr.write_text("""# Process retro R25–R30 (2026-11-05)

- Time/round: ~25–45 min; always 1 high-freq AI-dialog + 1 polish; local commits only; no GitHub.
- Theme chain: failure next / memory expand → hierarchy matrix → visual audit+seed → safetyContext/filter-empty → readonly banner → visual audit + prod↔readonly contrast.
- Rework: empty-store jump sold as hit (R26→R27 seed); prod banner lacked narrow until R30 contrast folder.
- User-facing gaps still open: true-device Tauri wide/narrow × dark/light (R6+ oral); EN chip short labels P3; port-forward deferred.
- Repeated ≥3: `tools/rXX/*.py` patches; harness expect when CopyToBox blocked; every-3 audits must land a fixable P2 same round.
- Standardize next: contrast matrices for exclusive UI pairs; banner/chrome default min-height 32px + narrow hint hide; keep held-out strategy cases out of Core-A tuning.
""", encoding="utf-8")
print("process retro ok")

# --- design after-code ---
design = ROOT / "docs/design/r30-full-page-visual-audit.md"
d = design.read_text(encoding="utf-8")
after = """
## After code
- Item1 `f2244676`: visual-audit backlog + design; banner `min-height: 32px` + ≤230px hide hint / chip ellipsis.
- Item2 `a72ffe9c`: contrast matrix `docs/screenshots/r30/` 8/8 expect true (prod/readonly × wide/narrow × dark/light).
- Docs: retro Round 30 + process note R25–R30; next full-page **Round 33**.
- Round 31 suggestion: AI-dialog empty/error narrow matrix, or Roadmap iter-3 dialog gap scan (port-forward still deferred).
"""
if "## After code" not in d or "f2244676" not in d:
    # replace placeholder after-code if present
    if "## After code" in d:
        import re
        d = re.sub(r"## After code\n.*", after.strip() + "\n", d, count=1, flags=re.S)
    else:
        d = d.rstrip() + "\n" + after
    design.write_text(d, encoding="utf-8")
    print("design after ok")
else:
    print("design after already")

# --- light touch on rule 14 if needed (banner touch) ---
rules = ROOT / "docs/dev-rules.md"
rr = rules.read_text(encoding="utf-8")
needle = "截图深链（jump-audit 等）必须 seed 匹配数据"
extra = "互斥 chrome 态（如 prod↔readonly 横幅）对照截图放同一 round 目录；新提醒条默认 `min-height: 32px` + 窄栏藏次要 hint。（R30）"
if "互斥 chrome 态" not in rr and needle in rr:
    rr = rr.replace(needle, extra + needle, 1)
    # Keep ≤15 rules — we appended into rule 14 text, not a new numbered rule
    rules.write_text(rr, encoding="utf-8")
    print("dev-rules ok")
else:
    print("dev-rules skip/already")

print("docs done")
