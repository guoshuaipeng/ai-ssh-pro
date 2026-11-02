# AI-SSH-Pro → Tauri 迁移说明（本机）

## 目标

用系统 WebView（Windows WebView2）替换 Electron/Chromium，把安装包体积压到接近 **20MB** 量级，并提升启动流畅度。

当前仓库为 **双轨**：Electron（`npm run dev` / `npm run dist`）仍可用；Tauri 为新主路径（`npm run dev:tauri` / `npm run build:tauri`）。

## 前置条件（Windows）

1. Node.js + npm（已有）
2. Rust stable：`rustup`（`cargo` / `rustc`）
3. MSVC Build Tools（`x64 Native Tools` / `cl.exe`）
4. WebView2 Runtime（Win10/11 一般已预装）

## 开发

```bash
npm install
npm run dev:tauri
```

等价于：Vite 在 `http://localhost:1420` 提供前端 + `cargo tauri dev` 打开原生窗口。

仅前端（浏览器里调试 UI，无 SSH 后端）：

```bash
npm run dev:web
```

## 构建

```bash
npm run build:tauri
```

产物一般在：

- `src-tauri/target/release/ai-ssh-pro.exe`（或 bundle 名）
- `src-tauri/target/release/bundle/nsis/*.exe`
- `src-tauri/target/release/bundle/msi/*.msi`

## 架构要点

| 层 | Electron | Tauri |
|---|---|---|
| 窗口 / WebView | Chromium | WebView2 |
| 前端 | `src/renderer` | 同目录，入口 `main.tauri.tsx` |
| 桥接 | `src/preload` → `window.aiss` | `tauri-bridge.ts` → `window.aiss` |
| SSH | `ssh2`（Node） | `russh`（Rust） |
| 持久化 | `electron-store` | `%AppData%/AI-SSH-Pro/store.json` |
| 字体 | `@fontsource` 整包 | **系统字体**（不打进安装包） |

## 本阶段已实现

- Tauri v2 工程（`src-tauri`）+ 窗口加载现有 React UI
- `window.aiss` 兼容桥（核心 API + stub）
- **Host key / known_hosts**：校验、UI 确认事件、永久信任落盘、列表/删除/批量导入；可从 Electron `ai-ssh-pro-known-hosts.json` 合并；**ProxyJump 每跳独立校验**
- **ProxyJump / jump chain**：最多 5 跳（`jumpChain` / 遗留 `jumpHost`），`direct-tcpip` + `connect_stream`
- **本机 Shell**：Windows `portable-pty`（ConPTY）
- **SFTP**：list / home / mkdir / remove / rename / stat / download / upload / readText / writeText / **chmod**；上下传 **进度事件** `sftp:progress`
- **端口转发**：本地（L）、**远程（R / tcpip-forward）**、**SOCKS5 动态（D）**
- **AI 流式**：OpenAI 兼容 SSE（`ai_chat` / `ai:stream` / abort / testProvider）；OpenClaw Agent 仍 stub
- **Electron store 导入**：发现 `%AppData%/ai-ssh-pro/ai-ssh-pro.json`，合并会话/分组/片段/AI 偏好 + known_hosts
- SSH：密码/私钥、PTY、读写、resize、exec、快照、断开
- 会话列表存盘；系统字体（不打 `@fontsource`）
- **自动更新**：明确推迟（需签名密钥 + 发布端点）；`app_check_update` 返回 `deferred`
- **Docker MVP**：`listTree` / containerAction / logs / inspect / composePs / composeAction（经 SSH exec）
- **本地加密备份**：与 Electron 兼容的 scrypt→AES-256-GCM（`.aissbak`）导出/导入
- **会话录音**：asciicast v2 录制（SSH/本机 PTY 输出）+ recordings list/read/delete
- **AI assist / parseSsh**：非流式 OpenAI 兼容补全；OpenClaw Agent 仍 stub
- **SFTP 对话框**：pickDownloadPath / pickUploadFiles / pickSavePaths；**简单队列**持久化
- **OpenSSH known_hosts**：文件选择 + 明文行导入预览（哈希行计 skipped）


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

## 体积策略

1. 不打包 `@fontsource`（改系统字体）
2. Release：`lto` + `opt-level = "s"` + `strip`
3. 后续可再关 MSI、只留 NSIS；按需裁 plugin


