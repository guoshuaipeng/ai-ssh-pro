from pathlib import Path
import re

p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")

t = t.replace(
    "- **OpenSSH known_hosts**：文件选择 + 明文行导入预览（哈希行计 skipped）；**`ssh-keygen -F` 单主机查找**（含 hashed 行，短时缓存）",
    "- **OpenSSH known_hosts**：文件选择 + 明文行导入预览；**`ssh-keygen -F` 单主机 + 批量主机列表查找**（含 hashed 行，短时缓存；不反向解哈希）",
)
t = t.replace(
    "- **OpenClaw / Core-A 最小路径**：步进 JSON（tool_call / command+HITL confirm / end）→ `ai:stream` step/exec；`resolveConfirm`；全量记忆/库存工具仍后置",
    "- **OpenClaw / Core-A 最小闭环**：步进 JSON + inventory search/get/context/append_note + memory get/context/set_goal/archive_goal（HITL 归档记忆落盘 `core-a-memory.json`）；系统提示注入归档/库存摘要",
)
t = t.replace(
    "- **云同步骨架**：Gist / WebDAV 配置落盘（`sync-config.json`）；加密信封复用 backup；**无 token/URL 时明确 `not-configured`，不假推送**",
    "- **云同步**：Gist / WebDAV 配置落盘（`sync-config.json`）+ SyncCenter 前端表单存 token/口令到本地；加密信封复用 backup；**无 token/URL 时明确 `not-configured`，不假装已连实网**",
)

# Add agent forward / probeJump to done list if not present
if "SSH agent forward" not in t.split("## 尚未移植")[0]:
    t = t.replace(
        "- **更新检查骨架**：查站点 `latest.json` / GitHub releases；**`installDeferred: true`**（真实安装需签名密钥 + tauri-plugin-updater 端点，见启用条件）",
        "- **更新检查骨架**：查站点 `latest.json` / GitHub releases；**`installDeferred: true`**（真实安装需签名密钥 + tauri-plugin-updater 端点，见启用条件）\n"
        "- **SSH agent forward**：目标机 only（jump hop 不转发）；Windows `\\\\.\\pipe\\openssh-ssh-agent` / `SSH_AUTH_SOCK`；`auth-agent@openssh.com` 代理\n"
        "- **probeJump**：逐跳探测、首败即停、信任主机密钥才过；emit `ssh:hop` / `ssh:stage`；桥接 `probeJump`/`onHop`/`onStage`",
    )

old_gap = """## 尚未移植（缺口）

- SSH agent forward；jump 失败续跳 / probeJump 完整 UX
- OpenClaw 全量：库存/笔记工具、HITL 归档记忆、多线程 Core-A
- 云同步：账号向导 UI、冲突合并策略、定时自动同步
- **真实自动安装更新**（代码签名证书 + `tauri-plugin-updater` 发布端点；当前仅 check）
- OpenSSH known_hosts 哈希行 **批量导入**（仍仅 `-F` 按名查找；不整文件解哈希）
"""

new_gap = """## 尚未移植（缺口）

- jump 失败自动续跳（probeJump 已停在首败并 emit `ssh:hop`/`ssh:stage`；连接路径仍需人工改链）
- OpenClaw 全量：多线程 Core-A、观测记忆、Electron 对等工具全集
- 云同步：冲突合并策略、定时自动同步、OAuth 浏览器登录（当前仅本地存 token；实网 push/pull 需用户 token）
- **真实自动安装更新**（**卡在用户代码签名证书** + `tauri-plugin-updater` 发布端点；当前仅 check，`installDeferred: true`）
- known_hosts：**无法**对 `|1|…` 哈希行做反向解哈希整文件导入（只能主机名列表 + `ssh-keygen -F` 批量解析后导入）
- SSH agent forward **实机验证**依赖本机 OpenSSH Authentication Agent / `SSH_AUTH_SOCK`（**卡在用户本机 Agent 服务与已加载密钥**）
"""

if old_gap not in t:
    raise SystemExit("gap section not found:\n" + t[t.find("## 尚未移植"):t.find("## 尚未移植")+500])
t = t.replace(old_gap, new_gap)

old_table = """| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | **7.43 MB** (7786496) | Round-5 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.13 MB** (3277022) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.03 MB** (4227072) | |"""

new_table = """| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | **7.62 MB** (7987200) | Round-6 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.18 MB** (3337872) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.12 MB** (4321280) | |"""

if old_table not in t:
    raise SystemExit("table not found")
t = t.replace(old_table, new_table)

# Round-6 summary
if "### Round-6 变更摘要" not in t:
    t = t.replace(
        "### 云同步 / 更新启用条件",
        """### Round-6 变更摘要

- SSH agent forward（目标 only）+ agent 认证；probeJump 完整 UX（hop/stage 事件）
- OpenClaw：inventory 库存/笔记 + core-memory HITL 归档最小闭环
- known_hosts 哈希行：主机列表批量 `ssh-keygen -F`（`lookupHostsBulk`）
- SyncCenter 本地存 token；updater/实网同步仍文档化启用条件，不硬做
- 新模块：`inventory.rs` / `core_memory.rs` / `jump_probe.rs`

### 云同步 / 更新启用条件""",
    )

p.write_text(t, encoding="utf-8")
print("MIGRATION updated")
