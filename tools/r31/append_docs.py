# -*- coding: utf-8 -*-
from pathlib import Path
from datetime import datetime

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# Append backlog
backlog = ROOT / "docs/backlog.md"
bt = backlog.read_text(encoding="utf-8")
block = """
## 2026-11-05 Round 31 追加
- **已完成**：H08 空/错态窄栏进截图矩阵 `docs/screenshots/r31/`（empty / model-missing / error settings+retry；宽基线 + 窄栏；深/浅 14 expect true，含 vs-prod 冲突态）。
- **已完成**：空态/配置卡/model-missing/错误 CTA ≤280px 折行收紧；`aiEmptyConfig` / `aiModelMissing` harness ops。
- **已完成（R30 P3 快修）**：model-missing 时隐藏生产/只读主机横幅，避免双条叠放。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R31）。
- P3：英文 chip Confirm/Suggest/Auto（R19）仍可真机抽检；策略题继续 held-out；pending Decline 权重可接受。
- P1 候选 Round 32：保持 AI 对话——Roadmap 迭代 3 前对话缺口扫（端口转发默认不接）/ 或 composer EN chip 短标签抽检 / 或审计↔对话深链窄栏再收一档。
- 下一整页视觉目标：**Round 33**。

### Round 31 UX 验收（编码后）
- 主 CTA：空态「配置 AI」；model-missing「去设置」；401 类错误 settings；429 类 retry。
- 绑定：截图 op 不改真实 Key/模型设置；横幅仍绑本会话 protection（model-missing 时让位）。
- 空/错：needs_config ≠ model-missing ≠ reply-empty ≠ error card。
- 守卫：`test-r31-empty-error-shots` / `test-r31-model-missing-banner`；Core-A 34/34；held-out H01–H08 绿；截图 14/14。

"""
if "2026-11-05 Round 31 追加" not in bt:
    # insert after first heading / top
    if bt.startswith("## "):
        bt = block + bt
    else:
        bt = bt + block
    backlog.write_text(bt, encoding="utf-8")
    print("backlog ok")
else:
    print("backlog already")

# Append retro
retro = ROOT / "docs/retro.md"
rt = retro.read_text(encoding="utf-8")
entry = """
## Round 31 — 2026-11-05（H08 空/错窄栏矩阵 + model-missing 抑横幅）
- 计划：约 30 分钟；1 高频：空/错态窄栏进 `docs/screenshots/r31/`；1 小打磨：R30 P3 model-missing↔横幅叠放；编码前 UX。
- 实际：~45 分钟；两项各一提交 + docs；Core-A 34/34 + held-out 全绿；r31 截图 14/14 expect true。
- 卡住点：① `needsModelPick` 插在 `currentModel` 之前 → TDZ `Cannot access 'currentModel' before initialization`，整页白屏 expect 全红；② 错误码曾用 `http_401`，`aiErrorWantsSettings` 只认 `AI_HTTP_*`；③ PowerShell 内联引号 → `tools/r31/*.py`。
- 根因：截图态派生变量必须放在依赖 state/派生之后；harness errorCode 必须与生产 `fe.code` 同形。
- 预防：新 panel 派生一律紧跟其依赖声明；Rxx 错误卡 shot 默认 `AI_HTTP_401/429`；Rxx 截图默认 rebuild。
- 验收：`test-r31-empty-error-shots` / `test-r31-model-missing-banner` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r31/`。
- 提交：`ecfbccf5`（矩阵+折行）、`f2de9460`（抑横幅）；docs 同轮。
- 逢 3 轮整页视觉：上一拍 Round 30 → **下一目标 Round 33**。

"""
if "Round 31 — 2026-11-05" not in rt:
    # prepend after title if any, else append at end near top rounds - append after first ## Round if exists
    idx = rt.find("## Round ")
    if idx >= 0:
        rt = rt[:idx] + entry + rt[idx:]
    else:
        rt = entry + rt
    retro.write_text(rt, encoding="utf-8")
    print("retro ok")
else:
    print("retro already")

# Update design after-code note
design = ROOT / "docs/design/r31-empty-error-narrow.md"
dt = design.read_text(encoding="utf-8")
if "After code" not in dt:
    dt += """
## After code
- Item1 `ecfbccf5`: ops + wrap CSS + matrix 6 core states × dark/light (+ vs-prod pngs staged).
- Item2 `f2de9460`: `needsModelPick` hides host banners; conflict shot `r31-model-missing-vs-prod-narrow`.
- Tests: Core-A 34/34; held-out H01–H08; `test-r31-*` green; screenshots 14/14.
- Round 32 suggestion: AI-dialog gap scan before Roadmap iter-3, or EN chip short-label check (port-forward still deferred). Next full-page visual: **Round 33**.
"""
    design.write_text(dt, encoding="utf-8")
    print("design after ok")
