# Changelog

## v0.4.0

2026-10-15 · 从 SSH 客户端到 AI 运维工作台 / From SSH client to AI ops workbench.

- **运维首页 / Ops home (L7)** — a unique center tab with host health cards (at most 8, alerts first), an alert inbox, and shortcuts. New installs open it. View → Ops home, or Ctrl+Alt+H.
- **告警工作台 / Alert workbench (L2)** — one list-and-detail tab for locate and AI read, with the privacy footnote in the detail. The bell and notification clicks open it on that alert. Ops → Alert workbench, or Ctrl+Alt+A.
- **生产 / 只读防护 / Protection levels (S2)** — each host is normal, production, or read-only. Production asks for the host name before a dangerous command, an alert run, or an SFTP write (upload, delete, mkdir, rename). Read-only blocks those writes and still allows insert. Temporary unlock lasts 15 minutes.
- **批量剧本 / Playbooks (L1)** — list, editor, and run wizard open as center tabs. Per-step confirm, stop-on-error, and timeout. Runs pick hosts, then parallel or serial, then a preview. Read-only hosts cannot be selected; production and dangerous steps still confirm. Results export; the audit log records `playbook.run`. Ctrl+Alt+P.
- **加密云同步 / Cloud sync (L3)** — File → Cloud sync… with a private Gist or WebDAV. The vault is encrypted on this device; the passphrase never leaves it and credentials are off by default. Conflicts open in a center tab. Overwrite-local writes a backup first.
- **终端命令块 / Terminal blocks (L5)** — off by default. When on, command chunks fold and offer AI explain, copy, and save as snippet. Turning them off keeps scrollback.
- **文件工作流 / File workflow (L8)** — the folder-sync preview can pin into a center tab and pins itself above 50 changes. Starting the sync still passes the remote write gate.
- **审计与录制 / Audit and recordings (L4)** — the audit tab searches and exports CSV or JSONL, including `playbook.run`, `alert.execute`, and `danger`. Session recording writes asciicast v2; auto-record is a real per-host switch.
- **密度打磨 / Density (UX-51 / UX-51b / UX-53)** — alert preferences float from ⋯ and close on Esc or an outside click; a health card shows a single badge (production, otherwise read-only, otherwise demo).
- **已知限制 / Known limits** — Jump hosts + OpenSSH certificates / sk-ed25519 (L6) are **deferred to v0.4.1**; the jump visualization and experimental cert options remain in the UI. With several center tabs open at 1366px the tab strip can wrap to two rows (UX-55, fixed in v0.4.1). “Last session” reconnects saved hosts only, not tool tabs. Alert history and the audit log stay in localStorage; this is not a server permission system.

## v0.4.0-m2

Preview of the ops flagship. Package version stays `0.4.0-m2`. Do not tag this build.

**Formal v0.4.0 acceptance.** M2-L6 (jump hosts, OpenSSH certificates, sk-ed25519) is **Deferred → v0.4.1**. The v0.4.0 tag ships without a live certificate or sk-ed25519 hop proof. Jump-host UI and hop visualization stay in this preview. The M2 priority cut allows L5 and L6 to slip; L1, L3, and L4b stay. **L5 stays in v0.4.0** (already Pass). Tag v0.4.0 when the remaining M2 acceptance checks are green.

- **Playbooks (L1)** — list, editor, and run wizard open as center tabs. Steps are commands or snippets (toolbox stays marked coming soon). Confirm, stop-on-error, and timeout are per step. Autosave waits 800ms. Ctrl+Alt+P opens the list. Runs pick hosts, then parallel or serial, then a preview. Read-only hosts cannot be selected. Production and dangerous steps still confirm. Results export, and the audit log records `playbook.run`.
- **Cloud sync (L3)** — File → Cloud sync… talks to a private Gist or WebDAV. The vault is encrypted with the backup envelope. The passphrase stays on this device. Scope checkboxes default credentials off. Conflicts open in a center tab. The status bar shows ✓ / ⟳ / ! / ✕ while sync is on. Overwrite-local writes a backup first.
- **Terminal blocks (L5)** — off by default. When on, command chunks fold and offer explain, copy, and save. Turning them off keeps the terminal scrollback. Stays in v0.4.0 (Pass).
- **Jump hosts (L6) — Deferred → v0.4.1.** Jump visualization stays in this preview: up to five hops, the failed hop named in the error, and a banner back to the editor. OpenSSH certificates and sk-ed25519 stay in the UI as experimental. Live cert / sk-ed25519 hop proof is the v0.4.1 formal acceptance check, and is not required to tag v0.4.0.
- **File workflow (L8)** — folder-sync preview can pin into a center tab, and pins itself above 50 changes. Starting the sync still passes the same remote write gate as upload and delete.
- **Audit and recordings (L4b)** — the audit tab searches and exports CSV or JSONL, including `playbook.run`, `alert.execute`, and `danger`. Session recording writes asciicast v2. Auto-record is a real profile switch and does not open a save dialog.
- **Density (UX-51 / UX-51b / UX-53)** — the privacy footnote appears on a successful alert explain. Alert preferences float from ⋯ and close on Esc or an outside click, leaving the filter bar on the first screen. With no alerts, Open dashboard lives in that menu. A health card shows one badge: production, otherwise read-only, otherwise demo.

## v0.4.0-m1

Pre-release of the ops workbench. The final `v0.4.0` tag waits for M2. Do not tag this build.

- **Ops home (L7)** — a unique center tab with host health cards (at most 8, alerts first), an alert inbox, and shortcuts. New installs open this tab. View → Ops home, or Ctrl+Alt+H. Startup can switch back to last session or a blank workspace.
- **Alert workbench (L2)** — one list-and-detail tab for locate (O4) and AI read (A4), with the privacy footnote in the detail. The bell and notification clicks open it and select the alert. Ops → Alert workbench, or Ctrl+Alt+A.
- **Protection levels (S2 / L4)** — each host is normal, production, or read-only. Production asks for the host name before a dangerous command, an alert run, or an SFTP write (upload, delete, mkdir, and rename). Read-only blocks those writes and still allows insert. Temporary unlock lasts 15 minutes. Sidebar badge, terminal banner, and the host profile section stay in sync.
- **Audit slice (S1)** — `alert.execute` and `danger` events are stored locally. Ops → Audit log can filter them. The full audit table is still ahead.
- **已知限制** — Playbook editing is a disabled “coming soon” link; auto-record is the same. “Last session” reconnects saved hosts only, not tool tabs. Alert history and the audit log stay in localStorage. This is not a server permission system.

## v0.3.19

- **Domestic update channel (N1)** — Settings → Updates: Auto (Gitee then GitHub), Gitee, GitHub, or a custom mirror. The download link comes from the same source that reported the version. About and the update dialog show the active source. Each source times out at about 8s; auto gives up after 16s.
- **Alert locate (O4)** — Dashboard badges and alert history rows have Locate. Disk opens toolbox disk usage, CPU/memory opens processes, a service alert opens systemd. A system notification click focuses the app and the host. With no session, the host picker connects first. The alert stays until the metric recovers or you ignore it.
- **AI alert read (A4)** — Alert cards and history rows have AI read. The prompt is that host’s metrics plus a truncated journal snippet, with the same insert / run / danger confirm as error explain. Unconfigured AI shows only the setup card.
- **Local ↔ remote diff (D5)** — SFTP context menu “Compare with local…” and a Compare action when each pane has one file selected. Read-only side-by-side or unified diff opens as a center tab, with a jump into the remote editor. Files over 2MB suggest an external tool.
- **Compact dual pane (UX-46)** — At 1366px and narrower the SFTP dual pane uses shorter rows, icon toolbar buttons, and a collapsible path. View → SFTP comfort density restores the roomier layout. 1024 and 1366 do not scroll sideways.
- **Competitor session import (N2)** — File → Import sessions… (and the empty host list) previews FinalShell, Xshell, MobaXterm, PuTTY, and SSH config: groups, host count, and skip / overwrite / copy. Passwords and keys are not written into notes or the preview.
- **Getting-started cards (G3)** — After the welcome tour, small cards offer connect / monitor / AI / file transfer. They do not cover the command bar. Completion is remembered; Help → Getting started tasks reopens them; dismiss all can be permanent.
- **已知限制** — Auto mode still needs a reachable Gitee or GitHub release API (or a custom mirror that returns the same JSON). Service locate is wired, but the built-in rules still cover CPU, memory, disk, and offline only. Diff is line-based and does not load files over 2MB. Import preview stores secrets only on the saved session, same as before. Also: localStorage prefs; no default service alert rules; diff skips >2MB; Auto update needs reachable Gitee/GitHub/mirror JSON.

## v0.3.18

- **SFTP dual pane (D1)** — local and remote side by side, drag-and-drop, transfer queue with pause / resume / cancel, and chunked resume via `.aisshpart`.
- **Folder sync (D2)** — Session → Folder sync… compares two trees, previews new/changed/deleted, then queues the copy. Saved profiles rerun from Ctrl+K.
- **Smart completion (X1)** — command bar accepts history with Tab; the terminal shows ghost text accepted with → or End. Tab in the terminal still reaches the shell.
- **Inline AI prefix (UX-36)** — the ✨ / `>_` control sits inside the 32px command bar.
- **AI setup card (UX-37)** — with no API key the AI panel shows only the setup card (no provider row, stop, or composer).
- **Tour placement (UX-38)** — welcome cards prefer the right side and avoid action areas; ← / → move between steps.
- **Upright tab titles (UX-42b)** — workspace, connecting, and disconnected tabs use the same roman face.
- **Host picker (UX-43b)** — Chinese title no longer inserts a stray space; rows show the online dot, latency, and folder.
- **已知限制** — History and sync profiles stay in localStorage. Closing the SFTP tab closes the transfer-queue UI (the main-process transfer can continue). Folder-sync deletes are best-effort and are not queued as their own tasks.

## v0.3.17

- **Threshold alerts (O2)** — configurable CPU/mem/disk/offline rules; dashboard red badge + optional system notifications; Ops → Alert rules… / Alert history; mute 1 hour.
- **Broadcast targets (X3)** — Session → Broadcast input (Ctrl+Alt+I) opens a target picker; keystrokes fan out to selected terminal tabs (no longer limited to split view).
- **AI inspection (A3)** — AI → Multi-host AI inspection… runs read-only checks, builds a Markdown report tab (local heuristics + optional AI assist).
- **Remote editor (D4)** — syntax highlighting by language; optional diff view before save; optional `.bak` on save.
- **Narrow titlebar (UX-17 / UX-23a)** — progressive compaction (hide version → icon-only tools → icon search → ☰ menus); "New connection" label always kept.
- **Friendly IPC errors (UX-35)** — strip `Error invoking remote method…` and map common errno/auth failures.
- **Palette pinyin (UX-11)** — Ctrl+K matches aliases like `xunjian`, `gaojing`, `kanban`.
- **ux-audit gate (UX-33)** — `npm run ux-audit` static checks in `npm test`.
- **Fix** — Multi-host dashboard tab now actually renders the O1 grid (was imported but not mounted).


## v0.3.16

- **Tool tabs fill the pane** — toolbox/monitor no longer leave a black empty band; table scrolls inside the tab.
- **No duplicate page chrome** — SFTP (and similar tool tabs) drop the repeated title + Close; use the tab ✕.
- **SFTP rows** — fixed 32px row height; action icons appear on hover only (UX-21).
- **Titlebar search** — "搜索功能… Ctrl+K" no longer clipped vertically (titleBarOverlay 40px + search button line-height).
- **New connection blank form** — New Connection always opens empty (placeholder 192.0.2.10); does not inherit sidebar selection.
- **Smart fill on top** — "智能填表" sits at the top of the connection form, not buried under Advanced.

- **Host profile redesign (UX-20)** — overview header with Connect / SFTP / Monitor / Toolbox; basic info read-only until Edit; compact hover-action service list; notes default to preview with readable width.
- **Toolbox row actions (UX-42)** — End / Force-kill hidden until hover; Force-kill behind ⋯ with confirm; Logs tab auto-loads the last 200 lines.
- **Monitor readability (UX-43)** — larger area trend charts (≥64px), 85% threshold warning icon, title unified as "Monitor · host", primary "Open toolbox".
- **Command bar collapsed by default (UX-44)** — ✨ FAB expands it; Ctrl+Shift+Space / AI fill also opens it; terminal padding 8×12.
- **Shortcut feedback (UX-45)** — ops shortcuts toast "Finish the current dialog first" while a Confirm/Prompt is open.
- **Unified context menus (UX-22)** — text fields and the terminal share one ContextMenu (copy/paste/AI explain/find/clear).
- **Multi-host dashboard (O1)** — Ops → Multi-host dashboard / Ctrl+Alt+M opens a card grid of CPU/mem/disk for connected hosts.
- **Demo SFTP (UX-34)** — simulated multi-folder tree, write actions disabled with friendly copy, no raw IPC errors.

## v0.3.15

- **Toolbox is a tab everywhere** — every entry (toolbar, Ops menu, Ctrl+Alt+T, Ctrl+K, host right-click, monitor's "Processes / services / logs…") opens the server toolbox as a center tab titled "Toolbox · host", one per host; no more modal dialog.
- **Port forwarding and Batch run are tabs too** — Session → Port forwarding…, Ctrl+Shift+O, tab right-click, and Ops → Batch run… / multi-host batch open center tabs instead of dialogs.
- **Right host every time** — opening Monitor / Toolbox from the host right-click menu right after connecting now targets that host, not another open session.
- **Tab bar** — many tabs scroll inside the bar instead of widening the window; the active tab stays in view; closing a tool tab returns to its host's terminal.
## v0.3.14

- **Tool tabs** — Resource monitor and server toolbox open as center tabs (deduped per host) instead of modal dialogs.
- **Minimal toolbar** — Default bar: New connection · Monitor · Toolbox · SFTP · Search (Ctrl+K); no More overflow.
- **Connection form** — Placeholder host `192.0.2.10`; single-column grouped form; Cancel / Save / Save & Connect footer.
- **AI panel** — Collapsed by default when unconfigured; empty-state with Configure AI; default width 320px; Stop only while generating.
- **SFTP layout** — Toolbar and file rows use nowrap to avoid wrapping at 1366×768.

## v0.3.13

- **Demo host** — try the terminal, resource monitor and server toolbox with simulated data, no server needed (sidebar empty state or Help → Try demo host). Dangerous commands are still intercepted.
- **Welcome tour** — 5 highlighted steps on first launch (new connection, ops tools, Ctrl+K search, AI panel, host right-click); Skip/Esc any time, replay from Help → Welcome tour.
- **Explain errors with AI** — when a command fails, "✨ Explain with AI" appears in the terminal corner (also terminal right-click → Explain selection with AI, and AI → AI: Explain the last error). The AI panel shows the cause, fix commands with Insert / Run (confirmed first), and notes.
- **Natural language → command** — type `#` in the command bar or press Ctrl+Shift+Space, describe the task, and get a command with a Safe / Caution / Dangerous label. Tab fills it in, Enter asks for confirmation, dangerous commands get the red interception dialog.
- **Host picker** — opening Monitor, Toolbox, SFTP, Port forwarding or Batch run with nothing connected asks which host to connect to, then opens the feature.
- **Polish** — native browser dialogs replaced by one in-app dialog style (danger actions in red, focus on Cancel); empty states with next steps in the sidebar, terminal area, snippets, port forwarding and SFTP; broadcast input shows a red bar, "Broadcasting · n" badge and tab dots, recording shows ●REC with its duration; menu names unified (SFTP files, Broadcast input, Recording, AI settings…, AI debug…, Batch run).

## v0.3.12

- **Version in the title bar** — click it to open "What's new" (Help → What's new).
- **Update notifications** — new releases are announced with Download / Later / Skip this version (Help → Check for updates…).
- **Host right-click menu** — Connect, Connect in new tab, SFTP files, Resource monitor, Server toolbox (auto-connects first), Copy user@host; Ctrl/Shift multi-select for Connect all / Batch run / Move / Delete.
- **Host online status** — green/yellow/grey dot with TCP latency next to each saved host, refreshed every 60 s (View → Show host status).
- **Terminal-friendly shortcuts** — plain Ctrl+letter keys go to the shell (tmux prefix works); sidebar Ctrl+Alt+1, SFTP Ctrl+Alt+F, toolbox Ctrl+Alt+T, find in terminal Ctrl+Shift+F, settings Ctrl+,. One keymap registry drives menus, F1 and the command palette.
- **Reorganised menus and toolbar** — File / Edit / View / Session / Ops / AI / Help with check marks on toggles; toolbar grouped into New/Recent · Ops tools · Search/More.
- **Release notes on GitHub** — tagged builds publish a non-draft release whose notes come from this changelog.

## v0.3.11

- Toolbar tool buttons, Tools/AI menus, command palette (Ctrl+Shift+P / Ctrl+K), host right-click resource monitor, What's new dialog.
