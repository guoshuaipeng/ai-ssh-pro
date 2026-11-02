from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")

# Update done bullets - insert before 尚未移植 if Round-7 not present
if "### Round-7 变更摘要" not in t:
    t = t.replace(
        "### Round-6 变更摘要",
        """### Round-7 变更摘要

- Jump **自动续跳**：失败 hop 寄存 `jumpSlots`，`resumeFromHop` / `jumpRetryFromFailedHop` 对齐 Electron；连接过程 emit `ssh:hop`/`ssh:stage`
- OpenClaw：观测记忆 bullets、多线程 list/epoch、agent tools `memory_observe` / `memory_list_threads`
- 云同步：冲突扫描 `findConflicts` + base revision 落盘；**本地定时骨架** `autoSyncEnabled/Minutes` → `sync:scheduleTick`（不假装实网成功）
- 桥接对齐：`localFs`（home/drives/list/stat/mkdir/rename/reveal/open/readText）、密钥选择、`files.saveText/reveal`、knownHosts 本地密钥列表
- 桌面快捷方式：`scripts/refresh-desktop-shortcut.ps1`；`npm run build:tauri` 结束后刷新，指向 `src-tauri/target/release/ai-ssh-pro.exe`

### Round-6 变更摘要""",
    )

old_gap = """## 尚未移植（缺口）

- jump 失败自动续跳（probeJump 已停在首败并 emit `ssh:hop`/`ssh:stage`；连接路径仍需人工改链）
- OpenClaw 全量：多线程 Core-A、观测记忆、Electron 对等工具全集
- 云同步：冲突合并策略、定时自动同步、OAuth 浏览器登录（当前仅本地存 token；实网 push/pull 需用户 token）
- **真实自动安装更新**（**卡在用户代码签名证书** + `tauri-plugin-updater` 发布端点；当前仅 check，`installDeferred: true`）
- known_hosts：**无法**对 `|1|…` 哈希行做反向解哈希整文件导入（只能主机名列表 + `ssh-keygen -F` 批量解析后导入）
- SSH agent forward **实机验证**依赖本机 OpenSSH Authentication Agent / `SSH_AUTH_SOCK`（**卡在用户本机 Agent 服务与已加载密钥**）
"""

new_gap = """## 尚未移植（缺口）

- OpenClaw 全量：episodes / citeHold / 运行摘要压缩与 Electron 观测管线完整对等；远程 tools（processes/services/ports/df/logs）与 workspace.batchExec/healthProbe
- 本地回收站 trash/restore、SFTP hash、snapshots 库、sessions.export / importSshConfig 完整解析
- 云同步：OAuth 浏览器登录、真正到点自动 push/pull（骨架只发 tick；**实网仍卡用户 token/口令**）
- **真实自动安装更新**（**卡在用户代码签名证书** + `tauri-plugin-updater` 发布端点；当前仅 check，`installDeferred: true`）
- known_hosts：**无法**对 `|1|…` 哈希行做反向解哈希整文件导入（只能主机名列表 + `ssh-keygen -F` 批量解析后导入）
- SSH agent forward / jump 续跳 **实机验证**依赖本机 Agent、跳板可达性与用户密钥
"""

if old_gap in t:
    t = t.replace(old_gap, new_gap)
else:
    print("WARN: gap block not exact; leaving as-is")

# sizes will update after build
p.write_text(t, encoding="utf-8")
print("migration patched")
