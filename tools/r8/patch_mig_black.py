from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
marker = "## 尚未移植（缺口）（Tauri-only 产品）"
hotfix = """## Hotfix：启动黑屏（2026-11-02 Asia/Shanghai）

**现象**：打开过 AI 对话后，再次启动桌面版黑屏（`#root` 空）。

**根因**：`showAi: true` 写入 `localStorage aiss-layout-v1` 后，重启会挂载 `AIPanel`；面板 `refreshWorkingGoal` 同步调用 `window.aiss.ai.getWorkingMemory`，Tauri 桥未实现该 Electron API → `TypeError: … is not a function` → React 整树挂掉（无 ErrorBoundary）。

**修复**：
- `tauri-bridge.ts`：补 `ai.getWorkingMemory`（读 `core_memory_get` → `workingMemory.goal`），并补 Electron 别名 `confirmStep` / `parseSshForm` / `setSessionProtection`（后者暂 no-op）
- `AIPanel.tsx`：对 `getWorkingMemory` 做函数存在性与 Promise 容错
- `main.tauri.tsx`：加 `ErrorBoundary`，避免单点异常再变黑屏

已 `build:tauri` + 刷新桌面快捷方式；CDP 验证 `showAi:true` 下主界面可进、无控制台异常。

"""
if "Hotfix：启动黑屏" not in t:
    if marker not in t:
        raise SystemExit("marker missing")
    t = t.replace(marker, hotfix + marker, 1)
    p.write_text(t, encoding="utf-8")
    print("MIGRATION updated")
else:
    print("MIGRATION already has hotfix")
