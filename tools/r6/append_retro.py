from pathlib import Path
retro = Path("docs/retro.md")
text = retro.read_text(encoding="utf-8")
block = """
## 2026-11-05 第 70 轮（Round 6）AI 对话 — 2.1 执行审计 UI + 截图矩阵
- 计划：约 30 分钟；高频 Roadmap 2.1 审计字段可见可用 + 真机/ harness 截图；逢 6 轮过程复盘。
- 实际：约 55 分钟。2.1 UI 交付；截图首轮全白屏后修好 WindowControls 再拍。
- 卡在哪：① Electron harness 把 chrome 场景嵌在模板字符串里，eval 内双引号/`\\u` 易弄炸语法；② `WindowControls` 顶层 import `@tauri-apps/api/window` 在无 `__TAURI_INTERNALS__` 时白屏；③ PowerShell `$PID` 只读导致 Tauri 置前脚本失败。
- 根因：双运行时（Electron QA + Tauri 产品）共用渲染层，Tauri-only 控件未守卫；截图场景字符串未按「模板字面量宿主」约束编写。
- 以后怎么避免：凡 `@tauri-apps/*` 改动态 import + `hasTauri()`；截图 eval 禁止嵌套双引号与 `\\u`；置前脚本用 `$procId` 勿碰 `$PID`。
- 验收：`test-ai-audit-ui` + Core-A 34/34；`docs/screenshots/r6/` 宽/窄×深/浅（见 README）；2.1 字段在审计表可见（来源/标签/结果/策略）。

## 过程复盘（每 6 轮 · R1–R6 / cycle 65–70）
- 时间：单轮常 35–55 分钟，超过 30 分钟目标；R5–R6 截图债反复占用。
- 返工：Windows CRLF / PowerShell 引号（R1–R4）；release 二进制落后于 HEAD 冒充验收（R3–R5）；R6 Electron 白屏整轮重拍。
- 用户侧：要求本地改、不连 GitHub；持续迭代；题目集含多轮。
- 重复信号：真机截图矩阵已连续 4+ 轮欠交付 → 应标准成「开工后台 build + harness 场景表」而不是每轮临时补。
- 规则候选：① 需要截图的轮次开工即 `--no-bundle` debug build 或 Electron harness；② Tauri-only 模块必须可在无 internals 时 no-op；③ 截图 eval 走单引号/DOM API，禁止嵌套双引号。
"""
if "第 70 轮（Round 6）" not in text:
    retro.write_text(text.rstrip() + "\n" + block + "\n", encoding="utf-8", newline="\n")
    print("retro appended")
else:
    print("retro already has R6")
