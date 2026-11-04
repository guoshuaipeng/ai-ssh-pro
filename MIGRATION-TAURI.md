# AI-SSH-Pro → Tauri 迁移说明（本机）

## 目标

用系统 WebView（Windows WebView2）替换 Electron/Chromium，把安装包体积压到接近 **20MB** 量级，并提升启动流畅度。

**产品路径：仅 Tauri**（小体积 WebView2）。默认脚本 `npm run dev` / `npm run build` 走 Tauri；桌面快捷方式 `AI-SSH-Pro (Tauri latest).lnk` 始终指向最新 `src-tauri/target/release/ai-ssh-pro.exe`。仓库内 Electron 源码可暂留作对照，但 **不再维护 Electron 打包/宣传**（如需：`npm run dev:electron` / `npm run build:electron` / `npm run dist:electron`）。

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
- **首次启动自动迁移（Round-11）**：Windows 下 `%AppData%\AI-SSH-Pro` 与 `%AppData%\ai-ssh-pro` **同一目录**（大小写不敏感）。Electron 写 `ai-ssh-pro.json`，Tauri 读 `store.json`；若 `store.json` 不存在或 `savedSessions.profiles` 为空，启动时自动从 `ai-ssh-pro.json` 导入；`known-hosts.json` 空时同样从 `ai-ssh-pro-known-hosts.json` 导入。亦可手动调用 `electron_store_import` / 桥 `importElectronStore`
- SSH：密码/私钥、PTY、读写、resize、exec、快照、断开
- 会话列表存盘；系统字体（不打 `@fontsource`）
- **自动更新**：版本检查可用（站点/GitHub）；**安装仍 deferred**（需签名密钥 + 发布端点）
- **Docker MVP**：`listTree` / containerAction / logs / inspect / composePs / composeAction（经 SSH exec）
- **本地加密备份**：与 Electron 兼容的 scrypt→AES-256-GCM（`.aissbak`）导出/导入
- **会话录音**：asciicast v2 录制（SSH/本机 PTY 输出）+ recordings list/read/delete
- **AI assist / parseSsh**：非流式 OpenAI 兼容补全
- **SFTP 对话框**：pickDownloadPath / pickUploadFiles / pickSavePaths；**简单队列**持久化
- **OpenSSH known_hosts**：文件选择 + 明文行导入预览；**`ssh-keygen -F` 单主机 + 批量主机列表查找**（含 hashed 行，短时缓存；不反向解哈希）
- **Docker Swarm**：`listTree` 完整 stacks/services；`swarmInspect` / `swarmLogs` / `swarmAction`（restart/scale）
- **Docker watch / openShell**：`docker events` → `docker:changed`；同连接 `docker exec -it` PTY（`owns_client=false`，断父会话时收口子会话）
- **SFTP 断点续传**：`sftp.transfer` + `.aisshpart`；下载 AsyncSeek、上传 APPEND；进度带 `resumedFrom`
- **OpenClaw / Core-A 最小闭环**：步进 JSON + inventory search/get/context/append_note + memory get/context/set_goal/archive_goal（HITL 归档记忆落盘 `core-a-memory.json`）；系统提示注入归档/库存摘要
- **云同步**：Gist / WebDAV 配置落盘（`sync-config.json`）+ SyncCenter 前端表单存 token/口令到本地；加密信封复用 backup；**无 token/URL 时明确 `not-configured`，不假装已连实网**
- **更新检查骨架**：查站点 `latest.json` / GitHub releases；**`installDeferred: true`**（真实安装需签名密钥 + tauri-plugin-updater 端点，见启用条件）
- **SSH agent forward**：目标机 only（jump hop 不转发）；Windows `\\.\pipe\openssh-ssh-agent` / `SSH_AUTH_SOCK`；`auth-agent@openssh.com` 代理
- **probeJump**：逐跳探测、首败即停、信任主机密钥才过；emit `ssh:hop` / `ssh:stage`；桥接 `probeJump`/`onHop`/`onStage`


## Hotfix：启动黑屏（2026-11-02 Asia/Shanghai）

**现象**：打开过 AI 对话后，再次启动桌面版黑屏（`#root` 空）。

**根因**：`showAi: true` 写入 `localStorage aiss-layout-v1` 后，重启会挂载 `AIPanel`；面板 `refreshWorkingGoal` 同步调用 `window.aiss.ai.getWorkingMemory`，Tauri 桥未实现该 Electron API → `TypeError: … is not a function` → React 整树挂掉（无 ErrorBoundary）。

**修复**：
- `tauri-bridge.ts`：补 `ai.getWorkingMemory`（读 `core_memory_get` → `workingMemory.goal`），并补 Electron 别名 `confirmStep` / `parseSshForm` / `setSessionProtection`（后者暂 no-op）
- `AIPanel.tsx`：对 `getWorkingMemory` 做函数存在性与 Promise 容错
- `main.tauri.tsx`：加 `ErrorBoundary`，避免单点异常再变黑屏

已 `build:tauri` + 刷新桌面快捷方式；CDP 验证 `showAi:true` 下主界面可进、无控制台异常。

## Hotfix：系统白顶栏（2026-11-02 Asia/Shanghai）

**现象**：Tauri 窗口上方多一条白色系统标题栏，关闭/最小化在系统栏，与 Electron 自绘标题栏不一致。

**修复**：`tauri.conf.json` → `decorations: false`（+ `label: main`、深色 `backgroundColor`）；标题栏右侧自绘 `WindowControls`（min/max/close）；capabilities 放开 window close/minimize/maximize/drag；`data-tauri-drag-region` 拖拽。

## 尚未移植（缺口）（Tauri-only 产品）

- OpenClaw：**远程向量 embedding 服务**仍不接（Round-10 用本地 char-trigram + RRF 作 embedding 槽位；可换真 embedding ranks 而不改 prompt）
- 第三方导入：厂商**专有加密库**仍不解密（已给清晰 notes；请导出明文 / OpenSSH config）
- 云同步：OAuth 浏览器登录、真正到点自动 push/pull（骨架只发 tick；**实网仍卡用户 token/口令**；Round-10 **只文档，不假装**）
- **真实自动安装更新**：signer 公钥 + 插件已接入；**仍缺真实发布端点 `latest.json` 与签名产物上传**（见下文「Updater 签名密钥」）
- known_hosts：**无法**对 `|1|…` 哈希行做反向解哈希整文件导入（只能主机名列表 + `ssh-keygen -F` 批量解析后导入）
- SSH agent forward / jump 续跳 **实机验证**依赖本机 Agent、跳板可达性与用户密钥
- Electron 打包：**不再作为产品主路径**（`dev:electron` / `dist:electron` 仅对照）

## 实测体积（本机 Windows x64，2026-11-02 Asia/Shanghai）

| 产物 | 大小 | 备注 |
|---|---|---|
| `ai-ssh-pro.exe`（release） | **8.11 MB** (8508928) | Round-10 |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **3.34 MB** (3505009) | |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **4.34 MB** (4554752) | |

对比：Electron ~169 MB / slim ~82 MB。**仍远低于 20 MB**。


### Round-10 变更摘要

- **OpenClaw cite scrub / compact**：`CiteWindow` 对齐 outsideHeadTail + droppedFiller；compact 时 scrub fillers；`applyCiteScrub` 命令
- **召回增强**：keyword + Jaccard overlap + **本地 char-trigram** ranks，RRF 融合（无远程 embedding）
- **单测**：`core_memory::tests` 5 项（scrub / rare markers / recall topK·相关性 / compact scrub）
- **会话导入边角**：加密/受保护 Xshell·Moba·FinalShell·SecureCRT·PuTTY 口令字段 → 明确中文 notes，不假装解密
- **桥安全**：`installTauriBridge` 末尾兜底 `getWorkingMemory` / `confirmStep` / `parseSshForm` / `setSessionProtection`，防再黑屏
- **云同步 / 签名 updater**：仍仅文档；不假装已实网 OAuth 或自动安装

### Round-9 变更摘要

- **第三方会话导入**：`session_import.rs`（Xshell `.xsh` / PuTTY reg·会话文件 / MobaXterm / SecureCRT / FinalShell）经 `sessions_import_pick`
- **healthProbe 独立短连池**：`probe_only` + `probe_held`；`healthProbeSweep` / `healthProbeRelease` 做实
- **workspace.resources** + **forwards.restore**（CarryStore 跨重连恢复）
- **SFTP/localFs hash**（sha256）+ **detectKeyKind**
- **OpenClaw**：`compactTurns` / `recall`（extractive + keyword；**无 embedding**）
- 桥：上述 API 接入；并防 AI 桥缺失导致启动崩溃（`getWorkingMemory` 等）

### Round-8 变更摘要

- **远程 tools**：`processes` / `kill` / `services` / `service` / `ports` / `df` / `logs`（`server_tools.rs` + `ssh.exec` 解析，对齐 shared/server-tools）
- **workspace**：`batchExec`（多会话并行 exec）、`healthProbe`（复用会话采样 / demo；无独立 probe 连接池）、sweep/release 空实现占位
- **snapshots**：加密远端文本快照（本地 `snapshot.key` + AES-GCM；list/stats/put/prefs/read/pin/delete/clear/openDir）
- **localFs.trash / restore**：本地暂存书 + token 撤销
- **sessions.export**（json / openssh）+ **importSshConfig**（Include 展开 + Host 解析）+ **importPick**（ssh-config / JSON profiles；Xshell/PuTTY/Moba 等仍缺口）
- **OpenClaw**：`episodes` / `citeHold` / `runningSummary` + `compress` / `appendEpisode` / `setCiteHold`（extractive 压缩管线；无 embedding）
- 桥：`tauri-bridge.ts` 上述 API 全部接真命令
- **产品策略**：默认入口改为 Tauri-only；Electron 降为可选对照脚本

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

### Round-7 变更摘要

- Jump **自动续跳**：失败 hop 寄存 `jumpSlots`，`resumeFromHop` / `jumpRetryFromFailedHop` 对齐 Electron；连接过程 emit `ssh:hop`/`ssh:stage`
- OpenClaw：观测记忆 bullets、多线程 list/epoch、agent tools `memory_observe` / `memory_list_threads`
- 云同步：冲突扫描 `findConflicts` + base revision 落盘；**本地定时骨架** `autoSyncEnabled/Minutes` → `sync:scheduleTick`（不假装实网成功）
- 桥接对齐：`localFs`（home/drives/list/stat/mkdir/rename/reveal/open/readText）、密钥选择、`files.saveText/reveal`、knownHosts 本地密钥列表
- 桌面快捷方式：`scripts/refresh-desktop-shortcut.ps1`；`npm run build:tauri` 结束后刷新，指向 `src-tauri/target/release/ai-ssh-pro.exe`

### Round-6 变更摘要

- SSH agent forward（目标 only）+ agent 认证；probeJump 完整 UX（hop/stage 事件）
- OpenClaw：inventory 库存/笔记 + core-memory HITL 归档最小闭环
- known_hosts 哈希行：主机列表批量 `ssh-keygen -F`（`lookupHostsBulk`）
- SyncCenter 本地存 token；updater/实网同步仍文档化启用条件，不硬做
- 新模块：`inventory.rs` / `core_memory.rs` / `jump_probe.rs`

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




## Updater 签名密钥（Tauri signer，非 Windows Authenticode）

> Round-11：已用官方 `cargo tauri signer generate` 生成本机密钥对；**私钥永不进 git**。

| 项 | 路径 / 说明 |
| --- | --- |
| 私钥 | `%USERPROFILE%\.tauri\ai-ssh-pro.key`（本机安全目录，已收紧 ACL） |
| 公钥 | `%USERPROFILE%\.tauri\ai-ssh-pro.key.pub` → 已写入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey` |
| 密码 | 当前为空密码（靠文件 ACL 保护）。若要加密码：`cargo tauri signer generate -w %USERPROFILE%\.tauri\ai-ssh-pro.key -p YOUR_PASS -f`，签名时设 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` |
| 插件 | `tauri-plugin-updater` + `bundle.createUpdaterArtifacts: true` + capability `updater:default` |
| 端点（占位） | GitHub Releases `.../latest/download/latest.json`；Pages `.../updater/{{target}}/{{arch}}/{{current_version}}.json` |

### 发布签名更新流程

1. **设置环境变量（本机或 CI secrets，勿提交）**
   - `TAURI_SIGNING_PRIVATE_KEY=%USERPROFILE%\.tauri\ai-ssh-pro.key  (build/bundle 可用路径或内容; signer sign 另可用 TAURI_SIGNING_PRIVATE_KEY_PATH)`
   - 或 `TAURI_SIGNING_PRIVATE_KEY=<私钥文件内容>`
   - 可选 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
2. **构建**：`npm run build:tauri`（或 `cargo tauri build`）。会生成 NSIS/MSI 及 updater 产物与 `.sig`。
3. **手动签单个文件（可选）**：
```bat
set TAURI_SIGNING_PRIVATE_KEY_PATH=%USERPROFILE%\.tauri\ai-ssh-pro.key
cargo tauri signer sign path\to\update-artifact
```
4. **发布**：把安装包、updater 产物、`.sig` 以及 `latest.json`（含 version、url、signature）上传到 GitHub Releases（或自建 HTTPS 端点）。把真实 URL 写回 `plugins.updater.endpoints`。
5. **仍缺**：真实 `latest.json` 托管、CI 注入私钥、（可选）Windows Authenticode 代码签名证书——Authenticode 与 updater 签名是两回事。

### 注意

- 丢失私钥或密码后，**已安装客户端无法再校验新更新**，必须重新分发带新公钥的应用。
- `.gitignore` 已忽略 `*.key` / `*.key.pub` / `_updater_pubkey.txt`。
- 应用内 `app.checkUpdate` 仍可读站点/GitHub 版本；在端点未提供有效签名清单前，自动安装保持谨慎（见 `updater.rs`）。
