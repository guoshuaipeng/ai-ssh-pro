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
- **AI 流式**：OpenAI 兼容 SSE（`ai_chat` / `ai:stream` / abort / testProvider）；**OpenClaw Core-A 最小路径**（`useOpenClaw`）
- **Electron store 导入**：发现 `%AppData%/ai-ssh-pro/ai-ssh-pro.json`，合并会话/分组/片段/AI 偏好 + known_hosts
- SSH：密码/私钥、PTY、读写、resize、exec、快照、断开
- 会话列表存盘；系统字体（不打 `@fontsource`）
- **自动更新**：版本检查可用（站点/GitHub）；**安装仍 deferred**（需签名密钥 + 发布端点）
- **Docker MVP**：`listTree` / containerAction / logs / inspect / composePs / composeAction（经 SSH exec）
- **本地加密备份**：与 Electron 兼容的 scrypt→AES-256-GCM（`.aissbak`）导出/导入
- **会话录音**：asciicast v2 录制（SSH/本机 PTY 输出）+ recordings list/read/delete
- **AI assist / parseSsh**：非流式 OpenAI 兼容补全
- **SFTP 对话框**：pickDownloadPath / pickUploadFiles / pickSavePaths；**简单队列**持久化
- **OpenSSH known_hosts**：文件选择 + 明文行导入预览（哈希行计 skipped）；**`ssh-keygen -F` 单主机查找**（含 hashed 行，短时缓存）
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

## 实测体积（本机 Windows x64，2026-11-02 Asia/Shanghai）

| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | **7.43 MB** (7786496) | Round-5 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.13 MB** (3277022) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.03 MB** (4227072) | |

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

## 体积策略

1. 不打包 `@fontsource`（改系统字体）
2. Release：`lto` + `opt-level = "s"` + `strip`
3. 后续可再关 MSI、只留 NSIS；按需裁 plugin


