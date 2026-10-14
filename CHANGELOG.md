# Changelog

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
