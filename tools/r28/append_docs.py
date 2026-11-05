from pathlib import Path

# Prepend Round 28 to backlog.md
backlog = Path("docs/backlog.md")
bt = backlog.read_text(encoding="utf-8")
r28b = """## 2026-11-05 Round 28 追加
- **Gap scan（Roadmap 迭代 3 前）**：迭代 2（2.1–2.5）与 H01–H08 均已交付；最高影响缺口 = Core-A 未传 `safetyContext`（S12 主机名 prod 但保护级仍默认 normal）。其余：filter-empty 未进矩阵、Decline 权重、真机 Tauri 矩阵、英文 chip P3；策略题继续 held-out。
- 已完成：Core-A fixture `safetyContext` 透传；S12 `protection=production`（主集仍 34，不并入 H01）。
- 已完成：审计 **filter-empty** 故意态进截图矩阵 + pending Decline 降权 → `docs/screenshots/r28/`（8/8）。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R28）。
- P1 候选 Round 29：保持 AI 对话——readonly 冷静横幅（对称 prod-auto）/ 或 Core-A 可选 readonly fixture 冒烟（仍不并 held-out 策略题）/ 或英文 chip 短标签抽检；默认不接端口转发。
- 未做：策略题继续 held-out（H01 不进 Core-A 调参）。
- 下一整页视觉目标：**Round 30**。

### Round 28 UX 验收（编码后）
- 主 CTA：待确认仍 Agree；Decline 透明次要；审计 filter-empty 主 CTA=清空筛选。
- 绑定：safetyContext 属本轮 fixture 主机；filter-empty 属本地面板筛选。
- 空/错：filter-empty ≠ true-empty（R26 文案）。
- 守卫：`test-r28-core-a-safety-context` / `test-r28-filter-empty-decline`；Core-A 34/34；held-out H01–H08 绿；截图 8/8。

"""
if "Round 28 追加" not in bt:
    backlog.write_text(r28b + bt, encoding="utf-8")
    print("backlog prepended")
else:
    print("backlog already")

retro = Path("docs/retro.md")
rt = retro.read_text(encoding="utf-8")
r28r = """## Round 28 — 2026-11-05（Gap scan + Core-A safetyContext + filter-empty / Decline）
- 计划：约 30 分钟；1 高频：迭代 3 前 AI 对话缺口扫描并交付最高影响项；1 小打磨：filter-empty 进矩阵 / Decline 降权；编码前 UX。
- 实际：~45 分钟；两项各一提交 + docs；Core-A 34/34 + held-out 全绿；r28 截图 8/8。
- Gap scan 摘要：Roadmap 2.1–2.5 与 H01–H08 已齐；最高影响未做 = Core-A 未传 safetyContext；其次 filter-empty 矩阵与 Decline 权重。
- 卡住点：① PowerShell 内联引号 → `tools/r28/*.py`；② App screenshot effect 须把 `openAudit` 列入 deps。
- 根因：S12 仅命名 prod 不足以走 production 路径；filter-empty 文案 R26 已有但无故意态截图。
- 预防：凡「主机名暗示保护级」的夹具必须显式 `safetyContext`；空态截图成对拍 true-empty / filter-empty / hit。
- 验收：`test-r28-core-a-safety-context` / `test-r28-filter-empty-decline` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r28/`。
- 提交：`36d970a2`（safetyContext）、polish（filter-empty+Decline）；docs 同轮。
- 逢 3 轮整页视觉：上一拍 Round 27 → **下一目标 Round 30**。

"""
if "Round 28 — 2026-11-05" not in rt:
    # insert after any leading blank / before first ## Round
    if rt.startswith("## Round"):
        retro.write_text(r28r + rt, encoding="utf-8")
    else:
        # find first ## Round
        i = rt.find("## Round")
        if i >= 0:
            retro.write_text(rt[:i] + r28r + rt[i:], encoding="utf-8")
        else:
            retro.write_text(r28r + rt, encoding="utf-8")
    print("retro prepended")
else:
    print("retro already")
