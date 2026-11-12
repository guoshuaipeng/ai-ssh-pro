from pathlib import Path

# Prepend Round 29 to backlog.md
backlog = Path("docs/backlog.md")
bt = backlog.read_text(encoding="utf-8")
block = """## 2026-11-05 Round 29 追加
- **已完成**：只读主机冷静横幅（对称 prod-auto）——`readonlyHostHint` + AI 面板 `ai-readonly-banner`（ok 色）；中文「只读主机 · AI 不会写入」；点击开策略；临时解锁终端时横幅仍在（AI 永不写）。
- **已完成**：截图矩阵 `docs/screenshots/r29/`（宽/窄 × 深/浅，4/4 expect true；op `aiReadonlyBanner`）。
- P2：真机 Tauri 宽窄×深浅仍欠（Electron harness R14–R29）。
- P3：英文 chip Confirm/Suggest/Auto（R19）仍可真机抽检；策略题继续 held-out。
- P1 候选 Round 30：**逢 3 轮整页视觉审计**（上一拍 Round 27）——AI 对话整页扫层级/空错态/窄栏（含只读/生产双横幅同屏不会出现、记忆/失败钉），发现入 backlog；可选顺手扩 harness 拍「生产横幅 vs 只读横幅」对照。默认不接端口转发。
- 未做：策略题继续 held-out（H01 不进 Core-A 调参）。
- 下一整页视觉目标：**Round 30（本轮注明，下轮执行）**。

### Round 29 UX 验收（编码后）
- 主 CTA：横幅是提醒条，点开策略；待确认仍 Agree。
- 绑定：横幅绑本会话 `protection` / screenshot override；与 prod-auto 互斥。
- 空/错：横幅 ≠ model-missing / reconnect。
- 守卫：`test-readonly-host-hint` / `test-r29-readonly-banner-shots`；Core-A 34/34；held-out H01–H08 绿；截图 4/4。

"""
if "Round 29 追加" not in bt[:800]:
    # insert after first heading line(s) or at top after any leading blank
    if bt.startswith("## 2026-11-05 Round 28"):
        bt = block + bt
    else:
        # find first ## 2026
        i = bt.find("## 2026-11-05 Round 28")
        if i >= 0:
            bt = bt[:i] + block + bt[i:]
        else:
            bt = block + bt
    backlog.write_text(bt, encoding="utf-8")
    print("backlog ok")
else:
    print("backlog already")

retro = Path("docs/retro.md")
rt = retro.read_text(encoding="utf-8")
rblock = """## Round 29 — 2026-11-05（只读主机冷静横幅 + 截图矩阵）
- 计划：约 30 分钟；1 高频：readonly calm banner 对称 prod-auto；1 小打磨：r29 截图矩阵；编码前 UX；注明 Round 30=整页视觉。
- 实际：~35 分钟；两项各一提交 + docs；Core-A 34/34 + held-out 全绿；r29 截图 4/4。
- 卡住点：① `test-prod-auto-hint` 仍断言旧 `protection ===` 而面板已用 `protectionForUi`（HEAD 已漂移）→ 本轮顺手修好；② PowerShell 引号 → `tools/r29/*.py`。
- 根因：AI 面板生产横幅已可见，只读仅终端/策略 chip 有感 → 用户以为只读「可能还会写」；elevate 解锁终端也不应暗示 AI 可写。
- 预防：主机保护级每加一档，AI 面板必须有对称冷静条；接线断言跟 `protectionForUi` 同源；Rxx 截图默认 rebuild。
- 验收：`test-readonly-host-hint` / `test-r29-readonly-banner-shots` + Core-A 34/34 + held-out 全绿；`docs/screenshots/r29/`。
- 提交：item1 readonly banner；item2 shot matrix；docs 同轮。
- 逢 3 轮整页视觉：上一拍 Round 27 → **下一目标 Round 30**。

"""
if "Round 29 — 2026-11-05" not in rt[:1200]:
    # prepend after title if any
    if rt.startswith("## Round 28") or rt.startswith("## Round 27") or "Round 28 —" in rt[:200]:
        # find first ## Round
        i = rt.find("## Round ")
        if i >= 0:
            rt = rt[:i] + rblock + rt[i:]
        else:
            rt = rblock + rt
    else:
        i = rt.find("## Round ")
        if i >= 0:
            rt = rt[:i] + rblock + rt[i:]
        else:
            rt = rblock + rt
    retro.write_text(rt, encoding="utf-8")
    print("retro ok")
else:
    print("retro already")

# list screenshots
shots = sorted(Path("docs/screenshots/r29").glob("*.png"))
print("shots", [s.name for s in shots])
