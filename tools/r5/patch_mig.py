from pathlib import Path
p = Path("MIGRATION-TAURI.md")
t = p.read_text(encoding="utf-8")

# Expand "本阶段已实现" with Round-5 items
old_impl_tail = """- **OpenSSH known_hosts**：文件选择 + 明文行导入预览（哈希行计 skipped）


## 尚未移植（缺口）

- SSH agent forward；jump 失败续跳 / probeJump 完整 UX
- SFTP：断点续传（队列持久化已有；真正 resume 后置）
- Docker：Swarm 详情/日志/动作、事件 watch、openShell
- OpenClaw / Core-A Agent（交互式分步 Agent）
- 云同步（WebDAV 等）；本机加密备份已可用
- **自动更新**（tauri-plugin-updater + 签名与端点）
- OpenSSH known_hosts **哈希主机行**（需 ssh-keygen -F；明文行导入预览已有）

## 实测体积（本机 Windows x64，2026-11-02 Asia/Shanghai）

| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | **7.16 MB** (7504384) | Round-4 +aes-gcm/scrypt |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.05 MB** (3196121) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **3.92 MB** (4108288) | |

对比：Electron ~169 MB / slim ~82 MB。**仍远低于 20 MB**。
"""

new_impl_tail = """- **OpenSSH known_hosts**：文件选择 + 明文行导入预览（哈希行计 skipped）；**`ssh-keygen -F` 单主机查找**（含 hashed 行，短时缓存）
- **Docker Swarm**：`listTree` 完整 stacks/services；`swarmInspect` / `swarmLogs` / `swarmAction`（restart/scale）
- **Docker watch / openShell**：`docker events` → `docker:changed`；同连接 `docker exec -it` PTY（`owns_client=false`，断父会话时收口子会话）
- **SFTP 断点续传**：`sftp.transfer` + `.aisshpart`；下载 AsyncSeek、上传 APPEND；进度带 `resumedFrom`
- **OpenClaw / Core-A 最小路径**：步进 JSON（tool_call / command+HITL confirm / end）→ `ai:stream` step/exec；`resolveConfirm`；全量记忆/库存工具仍后置
- **云同步骨架**：Gist / WebDAV 配置落盘（`sync-config.json`）；加密信封复用 backup；**无 token/URL 时明确 `not-configured`，不假推送**
- **更新检查骨架**：查站点 `latest.json` / GitHub releases；**`installDeferred: true`**（真实安装需签名密钥 + tauri-plugin-updater 端点，见启用条件）


## 尚未移植（缺口）

- SSH agent forward；jump 失败续跳 / probeJump 完整 UX
- OpenClaw 全量：库存/笔记工具、HITL 归档记忆、多线程 Core-A
- 云同步：账号向导 UI、冲突合并策略、定时自动同步
- **真实自动安装更新**（代码签名证书 + `tauri-plugin-updater` 发布端点；当前仅 check）
- OpenSSH known_hosts 哈希行 **批量导入**（仍仅 `-F` 按名查找；不整文件解哈希）

## 实测体积（本机 Windows x64，待 Round-5 构建回填）

| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | _(build)_ | Round-5 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | _(build)_ | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | _(build)_ | |

对比：Electron ~169 MB / slim ~82 MB。目标仍 **≤20 MB**。
"""

assert old_impl_tail in t, "impl/gap block mismatch"
t = t.replace(old_impl_tail, new_impl_tail)

# Insert Round-5 summary after Round-4
r4 = """### Round-4 变更摘要

- Docker MVP（listTree / action / logs / inspect / compose）
- 本地加密备份 import/export（Electron 兼容 envelope）
- 会话录音 asciicast v2 + 库管理
- AI assist / parseSsh
- SFTP 文件对话框 + 队列持久化
- OpenSSH known_hosts 明文导入预览
- 新模块：`docker.rs` / `backup.rs` / `recording.rs` / `dialogs.rs`
"""
r5 = r4 + """
### Round-5 变更摘要

- Swarm detail/logs/action + events watch + docker openShell
- SFTP resume（`.aisshpart` + offset）
- OpenClaw Core-A 最小步进 Agent（`agent.rs`）
- 云同步可配置骨架（`sync.rs`：Gist/WebDAV）
- 更新检查骨架（`updater.rs`；安装仍 deferred）
- hashed known_hosts：`ssh-keygen -F`（`known_hosts_lookup.rs`）

### 云同步 / 更新启用条件

**云同步**

1. 设置 → 配置 `provider` = `gist` | `webdav`
2. Gist：GitHub token（gist 权限）+ `gistId`；WebDAV：`webdavUrl` + 用户名/密码
3. 设置同步口令（`syncPassphrase`，用于 backup 同款 AES 信封）
4. 调用 `aiss.sync.test` / `push` / `pull`；未配置返回 `not-configured` / `missing-*`，**不会静默空成功**

**真实自动更新**

1. 取得代码签名证书（Windows Authenticode）
2. 接入 `tauri-plugin-updater`，配置公钥与发布 endpoint（或 GitHub release assets 签名）
3. 发布带签名的 bundle；当前 `app.checkUpdate` 只读远程版本并设 `installDeferred: true`，**不会下载安装**
"""
if "### Round-5 变更摘要" not in t:
    assert r4 in t
    t = t.replace(r4, r5)

# Also update AI / updater bullets in earlier "已实现" that still say stub
t = t.replace(
    "- **AI 流式**：OpenAI 兼容 SSE（`ai_chat` / `ai:stream` / abort / testProvider）；OpenClaw Agent 仍 stub",
    "- **AI 流式**：OpenAI 兼容 SSE（`ai_chat` / `ai:stream` / abort / testProvider）；**OpenClaw Core-A 最小路径**（`useOpenClaw`）"
)
t = t.replace(
    "- **自动更新**：明确推迟（需签名密钥 + 发布端点）；`app_check_update` 返回 `deferred`",
    "- **自动更新**：版本检查可用（站点/GitHub）；**安装仍 deferred**（需签名密钥 + 发布端点）"
)
t = t.replace(
    "- **AI assist / parseSsh**：非流式 OpenAI 兼容补全；OpenClaw Agent 仍 stub",
    "- **AI assist / parseSsh**：非流式 OpenAI 兼容补全"
)

p.write_text(t, encoding="utf-8")
print("MIGRATION updated")
