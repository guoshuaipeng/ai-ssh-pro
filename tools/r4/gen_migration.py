from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
md = (ROOT / "MIGRATION-TAURI.md").read_text(encoding="utf-8")

# Update 本阶段已实现 / 尚未移植 / 体积
old_gap = """## 尚未移植（缺口）

- SSH agent forward；jump 失败续跳 / probeJump 完整 UX
- SFTP：断点续传、队列、文件选择对话框
- Docker 管理、OpenClaw / Core-A Agent、AI assist / parseSsh
- 备份加密、云同步、会话录音回放
- **自动更新**（tauri-plugin-updater + 签名与端点）
- OpenSSH known_hosts 文件选择导入预览（哈希主机行）
"""

new_gap = """## 尚未移植（缺口）

- SSH agent forward；jump 失败续跳 / probeJump 完整 UX
- SFTP：断点续传（队列持久化已有；真正 resume 后置）
- Docker：Swarm 详情/日志/动作、事件 watch、openShell
- OpenClaw / Core-A Agent（交互式分步 Agent）
- 云同步（WebDAV 等）；本机加密备份已可用
- **自动更新**（tauri-plugin-updater + 签名与端点）
- OpenSSH known_hosts **哈希主机行**（需 ssh-keygen -F；明文行导入预览已有）
"""

if old_gap not in md:
    raise SystemExit("gap section missing")
md = md.replace(old_gap, new_gap)

# Add to 本阶段已实现
marker = "- **自动更新**：明确推迟（需签名密钥 + 发布端点）；`app_check_update` 返回 `deferred`"
extra = """- **自动更新**：明确推迟（需签名密钥 + 发布端点）；`app_check_update` 返回 `deferred`
- **Docker MVP**：`listTree` / containerAction / logs / inspect / composePs / composeAction（经 SSH exec）
- **本地加密备份**：与 Electron 兼容的 scrypt→AES-256-GCM（`.aissbak`）导出/导入
- **会话录音**：asciicast v2 录制（SSH/本机 PTY 输出）+ recordings list/read/delete
- **AI assist / parseSsh**：非流式 OpenAI 兼容补全；OpenClaw Agent 仍 stub
- **SFTP 对话框**：pickDownloadPath / pickUploadFiles / pickSavePaths；**简单队列**持久化
- **OpenSSH known_hosts**：文件选择 + 明文行导入预览（哈希行计 skipped）
"""
if "Docker MVP" not in md:
    md = md.replace(marker, extra)

# Replace size section with placeholder note for Round-4 (will fill after build)
old_size = """## 实测体积（本机 Windows x64，2026-11-02 Asia/Shanghai）

| 产物 | 大小 | vs Round-2 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | **6.91 MB** (7,244,800) | +reqwest/rustls |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **2.97 MB** (3,112,643) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **3.81 MB** (3,993,600) | |

对比：Electron ~169 MB / slim ~82 MB。**仍远低于 20 MB**。Round-3 引入 `reqwest`+`rustls`（AI 流式）后 NSIS 约 3 MB 级。

### Round-3 变更摘要

- ProxyJump / jump chain（含 per-hop host-key）
- 端口转发 R（tcpip-forward）+ D（SOCKS5）
- AI OpenAI 兼容流式；updater 明确推迟
- SFTP chmod + `sftp:progress`
- 新模块：`ai.rs`；扩展 `forward.rs` / `ssh.rs`
"""

new_size = """## 实测体积（本机 Windows x64，2026-11-02 Asia/Shanghai）

| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | **ROUND4_EXE** | Round-4 +aes-gcm/scrypt |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **ROUND4_NSIS** | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **ROUND4_MSI** | |

对比：Electron ~169 MB / slim ~82 MB。**仍远低于 20 MB**。

### Round-3 变更摘要

- ProxyJump / jump chain（含 per-hop host-key）
- 端口转发 R（tcpip-forward）+ D（SOCKS5）
- AI OpenAI 兼容流式；updater 明确推迟
- SFTP chmod + `sftp:progress`
- 新模块：`ai.rs`；扩展 `forward.rs` / `ssh.rs`

### Round-4 变更摘要

- Docker MVP（listTree / action / logs / inspect / compose）
- 本地加密备份 import/export（Electron 兼容 envelope）
- 会话录音 asciicast v2 + 库管理
- AI assist / parseSsh
- SFTP 文件对话框 + 队列持久化
- OpenSSH known_hosts 明文导入预览
- 新模块：`docker.rs` / `backup.rs` / `recording.rs` / `dialogs.rs`
"""

if old_size not in md:
    raise SystemExit("size section missing")
md = md.replace(old_size, new_size)
(ROOT / "MIGRATION-TAURI.md").write_text(md, encoding="utf-8")
print("MIGRATION updated")