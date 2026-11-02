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
- **Host key / known_hosts**：校验、UI 确认事件、永久信任落盘、列表/删除/批量导入；可从 Electron `ai-ssh-pro-known-hosts.json` 合并
- **本机 Shell**：Windows `portable-pty`（ConPTY）
- **SFTP 基础**：list / home / mkdir / remove / rename / stat / download / upload / readText / writeText
- **本地端口转发（L）**：监听本地端口并 `direct-tcpip` 到远端
- **Electron store 导入**：发现 `%AppData%/ai-ssh-pro/ai-ssh-pro.json`，合并会话/分组/片段/AI 偏好 + known_hosts
- SSH：密码/私钥、PTY、读写、resize、exec、快照、断开
- 会话列表存盘；系统字体（不打 `@fontsource`）

## 尚未移植（缺口）

- ProxyJump / jump chain / agent forward / host-key per-hop
- SFTP：chmod、断点续传、进度事件、队列、文件选择对话框
- 远程转发（R）/ SOCKS5（D）
- Docker 管理、AI 流式对话 / OpenClaw Agent
- 备份加密、云同步、会话录音回放、自动更新
- OpenSSH known_hosts 文件选择导入预览（哈希主机行）

## 实测体积（本机 Windows x64，2026-11-02 Asia/Shanghai）

| 产物 | 大小 |
|---|---|
| `ai-ssh-pro.exe`（release） | **5.54 MB** (5,814,272) |
| NSIS `AI-SSH-Pro_0.7.0_x64-setup.exe` | **2.37 MB** (2,486,327) |
| MSI `AI-SSH-Pro_0.7.0_x64_en-US.msi` | **3.08 MB** (3,231,744) |

对比：Electron 安装包 ~169 MB，slim ~82 MB。**Tauri 仍远低于 20 MB 目标**；相对 Round-1（exe 5.15 / NSIS 2.25 / MSI 2.91）仅 +0.39 / +0.12 / +0.17 MB。

### Round-2（缺口补齐）变更摘要

- 新增模块：`known_hosts.rs`、`hostkey.rs`、`local_shell.rs`、`forward.rs`、`import_electron.rs`
- `tauri-bridge.ts` 对接 hostKey 事件、SFTP、forwards、local shell、electron store 导入
- 依赖：`russh-sftp`、`portable-pty`、`sha2`（体积可控）

## 体积策略

1. 不打包 `@fontsource`（改系统字体）
2. Release：`lto` + `opt-level = "s"` + `strip`
3. 后续可再关 MSI、只留 NSIS；按需裁 plugin

