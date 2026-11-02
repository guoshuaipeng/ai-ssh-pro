from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")
# insert titlebar hotfix after blackscreen hotfix if present
note = """## Hotfix：系统白顶栏（2026-11-02 Asia/Shanghai）

**现象**：Tauri 窗口上方多一条白色系统标题栏，关闭/最小化在系统栏，与 Electron 自绘标题栏不一致。

**修复**：`tauri.conf.json` → `decorations: false`（+ `label: main`、深色 `backgroundColor`）；标题栏右侧自绘 `WindowControls`（min/max/close）；capabilities 放开 window close/minimize/maximize/drag；`data-tauri-drag-region` 拖拽。

"""
if "系统白顶栏" not in t:
    marker = "## 尚未移植（缺口）（Tauri-only 产品）"
    if "Hotfix：启动黑屏" in t:
        # after blackscreen section - before 尚未移植
        t = t.replace(marker, note + marker, 1)
    else:
        t = t.replace(marker, note + marker, 1)
    p.write_text(t, encoding="utf-8")
    print("MIGRATION titlebar note")
else:
    print("already")

# Round-9 section - update 尚未移植 list
old_gap = """- sessions **完整**第三方导入：Xshell / PuTTY / MobaXterm / SecureCRT / FinalShell（importPick 已支持 OpenSSH config + JSON profiles）
- healthProbe **独立**短连 probe 池（现仅 `reuseSessionId` / demo；无 held probe client）
- workspace.resources 完整面板、forwards.restore 批量恢复；SFTP `hash` / `detectKeyKind` 等边角
- OpenClaw：embedding 召回、与 Electron 同构的完整 transcript compact / cite scrub 测试覆盖"""
new_gap = """- OpenClaw：**向量 embedding 召回**仍缺（Round-9 已上 extractive `compactTurns` + keyword `recall`；无 embedding 模型）
- OpenClaw：与 Electron 同构的 cite scrub / compact **测试覆盖**仍缺
- 第三方导入：部分私有加密格式 / 未导出会话仍可能解析不到（Xshell `.xsh` / PuTTY `.reg` / Moba / SecureCRT / FinalShell 主路径已接）"""
if old_gap in t:
    t = t.replace(old_gap, new_gap, 1)
    # add Round-9 summary before Round-8
    r9 = """### Round-9 变更摘要

- **第三方会话导入**：`session_import.rs`（Xshell `.xsh` / PuTTY reg·会话文件 / MobaXterm / SecureCRT / FinalShell）经 `sessions_import_pick`
- **healthProbe 独立短连池**：`probe_only` + `probe_held`；`healthProbeSweep` / `healthProbeRelease` 做实
- **workspace.resources** + **forwards.restore**（CarryStore 跨重连恢复）
- **SFTP/localFs hash**（sha256）+ **detectKeyKind**
- **OpenClaw**：`compactTurns` / `recall`（extractive + keyword；**无 embedding**）
- 桥：上述 API 接入；并防 AI 桥缺失导致启动崩溃（`getWorkingMemory` 等）

"""
    if "### Round-9" not in t:
        t = t.replace("### Round-8 变更摘要", r9 + "### Round-8 变更摘要", 1)
    p.write_text(t, encoding="utf-8")
    print("MIGRATION r9 gaps updated")
else:
    print("gap block not found or already updated")
    p.write_text(t, encoding="utf-8")
