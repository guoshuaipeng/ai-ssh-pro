# Changelog

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
