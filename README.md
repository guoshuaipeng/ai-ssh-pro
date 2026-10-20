# AI-SSH-Pro

类 Xshell 的多会话 SSH 客户端，集成 AI 对话（Electron + TypeScript + React）。当前版本 **0.7.0**。

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

> **Privacy:** SSH passwords, private keys, and LLM API keys are stored only on your machine
> (`electron-store` / OS secure storage under the app userData directory). They are **not**
> part of this repository. Do not commit `.env`, key files, or exported session dumps that
> contain secrets.

## Screenshots

> Demo data only (`scripts/screenshot-demo.mjs` renders the app with fake hosts in an isolated profile).

| Dark | Light |
| --- | --- |
| ![Main window, dark](docs/screenshots/main-dark.png) | ![Main window, light](docs/screenshots/main-light.png) |

![Keyboard shortcuts (F1)](docs/screenshots/shortcuts.png)

## Download

- **Official site / update manifest:** https://guoshuaipeng.github.io/ai-ssh-pro/ ([`update.json`](https://guoshuaipeng.github.io/ai-ssh-pro/update.json))
- **GitHub Releases:** https://github.com/guoshuaipeng/ai-ssh-pro/releases
- **123 Cloud Disk (123 云盘):** share link is published in the official manifest (`pan123`) for users in mainland China
- **Gitee:** source mirror only — https://gitee.com/guoshuaipeng/ai-ssh-pro — not used as an update API

The in-app checker reads the official manifest first and falls back to the GitHub Releases API. Builds are **not code-signed**.

## Features

- **Multi-tab SSH** — password / private-key auth, xterm terminal, session groups
- **SFTP** — browse and transfer files over the active SSH session
- **ProxyJump** — hop through bastion / jump hosts
- **Port forward** — local / remote forwarding
- **Host key TOFU** — confirm fingerprint on first connect; warn on change
- **Encrypted secrets** — session passwords, key passphrases, and API keys via Electron `safeStorage`
- **Keepalive & reconnect** — SSH keepalive plus one-click reconnect after disconnect
- **AI Core-A** — observe → plan → run under one of three policies (**Suggest only** / **Confirm before run** / **Auto run**); terminal snapshot auto-read; chats are bound to the terminal tab
- **Ops home** — host health, alerts, and shortcuts on the start page
- **Docker / playbooks / audit** — container toolbox, dry-run playbooks, alert workbench, audit log
- **Terminal prefs** — font, theme, and related terminal settings
- **Snippets** — reusable command snippets
- **Session export / import** — Xshell `.xsh`, OpenSSH `config`, PuTTY
- **Split terminal** — side-by-side panes in a session
- **Recording** — capture terminal output
- **Local shell** — optional local PTY (requires `node-pty`; may need rebuild — see below)
- **Host inventory** — local host knowledge base (services, notes); AI + MCP share the same files
- **Batch execute** — pick connected SSH sessions and run one command on all of them after an explicit click; each session shows its own result
- **Command history** — recent commands (up to 200) stored locally; Up-arrow and suggestions in the command bar
- **Recent connections** — successful connects (host, user, port, label, time) with bookmarks. Passwords and keys are not stored; quick-connect reuses a saved session when one matches
- **Interface language** — Simplified Chinese (default) and English for the main chrome and these features; the choice is saved on this machine
- **Server toolbox** (Session → Server toolbox…, `Ctrl+Shift+T`) — for a connected Linux host: top processes with filter/sort and End / Force kill; systemd services with failed-unit badge, status, start / stop / restart; listening ports (`ss`/`netstat`) with one-click *Forward locally*; log viewer for files or the journal with keyword highlight, level filter and 3 s follow. Every action asks first, and an optional *Use sudo* runs it through `sudo -n`
- **Resource monitor** — CPU, memory, swap, load, disks and uptime refreshed every 5 s, with a 5-minute CPU / memory trend
- **Port forwarding manager** — add and stop local forwards on a live session and see connections and traffic per forward
- **Encrypted backup** — export sessions, folders and snippets into one password-protected file (AES-256-GCM) and restore it on another machine

## Development

```bash
npm install
npm run dev
```

Typecheck:

```bash
npm run typecheck
```

Package for distribution (Windows NSIS installer + unpacked `dir`; macOS DMG when building on macOS):

```bash
npm run dist
```

Artifacts land under `release/`.

## Host inventory & MCP

Host profiles live on disk (separate from the optional encrypted backup in Settings → Backup):

- Default root: `~/.ai-ssh-pro/inventory`
- Override with env `AISS_INVENTORY_ROOT`
- Layout: `index.json` + `hosts/{id}/meta.json`, `services.json`, `notes.md`

In the app: toolbar **主机档案**, menu **会话 → 主机档案…**, or right-click a saved session → **主机档案**. Link a profile with **关联当前会话**. AI chat receives `hostInventoryId` / `inventoryLookup` from the active tab.

### MCP server

Standalone stdio MCP server (same file layout as the app):

```bash
npm run mcp:inventory
# or
node scripts/mcp-inventory-server.mjs
```

CLI smoke test:

```bash
node scripts/mcp-inventory-server.mjs --list
node scripts/mcp-inventory-server.mjs --export inventory-backup.json
node scripts/mcp-inventory-server.mjs --import inventory-backup.json
```

Example Cursor / Claude Desktop MCP config:

```json
{
  "mcpServers": {
    "ai-ssh-pro-inventory": {
      "command": "node",
      "args": ["/absolute/path/to/ai-ssh-pro/scripts/mcp-inventory-server.mjs"],
      "env": {
        "AISS_INVENTORY_ROOT": "/home/YOU/.ai-ssh-pro/inventory"
      }
    }
  }
}
```

Tools: `list_hosts`, `get_host`, `search_hosts`, `upsert_host`, `upsert_service`, `append_note`.

## AI configuration

1. Open **AI 配置** from the menu or toolbar
2. Enter an OpenAI-compatible Provider (e.g. DashScope `.../compatible-mode/v1`) and API Key
3. Core-A is on by default; turn it off for single-shot streaming chat. AI write policy is **Suggest only** / **Confirm before run** / **Auto run** (Settings → AI, or per host)

Optional environment variables:

| Variable | Description |
|----------|-------------|
| `BBS_AI_AUDIT_MODEL` | Default model name (fallback `qwen-max`) |
| `AISS_MAX_POLLS` | Core-A max steps (default `10`) |
| `AISS_INVENTORY_ROOT` | Override host inventory directory |

## Security notes

- Passwords, key passphrases, and API keys are encrypted at rest with OS secure storage (e.g. Windows DPAPI). If encryption is unavailable, the app may fall back to plaintext and log a console warning.
- Host keys live in a separate store: `ai-ssh-pro-known-hosts`.
- Do not save production credentials on untrusted machines.
- There is **no vendor account**. Optional **encrypted cloud backup / sync** (Settings → Backup) is something you configure yourself; secrets still stay in OS secure storage on this machine. You can also export/import sessions as JSON.
- Recent connections store host, user, port, label, and time only. They do not store passwords, key paths, or passphrases.
- Command history stores the commands you choose to send (capped at about 200) in the same local store. If you type a secret into a command, that text stays on this machine until you clear history.
- There is no telemetry.

## Serial ports

AI-SSH-Pro does **not** open hardware serial ports (COM / ttyUSB / cu.*). Use **Local shell** for an on-machine PTY, or run your OS serial tool (`PuTTY`, `minicom`, `screen`, etc.) outside the app. Menu **File → Serial port…** / Ctrl+K repeats this note.

## Local shell (`node-pty`)

Local shell support depends on the optional dependency `node-pty`. After `npm install`, you may need to rebuild native modules for Electron, for example:

```bash
npx electron-rebuild -f -w node-pty
```

If `node-pty` fails to install or rebuild, SSH and the rest of the app still work; only the local shell feature is unavailable.

## Project layout

- `src/main` — Electron main process (SSH, AI, storage)
- `src/preload` — `window.aiss` bridge
- `src/renderer` — React UI
- `src/shared/ipc.ts` — shared types and IPC protocol

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security reports: [SECURITY.md](./SECURITY.md).

中文说明：[README.zh-CN.md](./README.zh-CN.md).

## License

[MIT](./LICENSE)
