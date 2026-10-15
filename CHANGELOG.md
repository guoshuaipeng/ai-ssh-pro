# Changelog

## Unreleased

v0.4.4 soft-start. Package version stays `0.4.3` until the formal bump. Not tagged.

- **告警规则模板（L2c）/ Alert rule packs.** 内置 CPU 过高、磁盘将满、sshd 异常三套模板，一键写入本机规则。可改范围和阈值，可禁用或删除。总开关关闭时只写入、不通知。不执行命令。 / Three built-in packs (high CPU, disk filling, sshd) write local rules in one click. Scope and thresholds stay editable. A disabled master switch writes the rules and does not notify. No command runs.
- **采样策略（L7c）/ Sampling policy.** 在 L7b 范围上再按标签、仅生产、排除只读过滤。失败退避 30 秒、60 秒、2 分钟，然后封顶（默认 5 分钟）。重试全部只碰失败的主机，10 秒冷却。 / Tag, production-only, and exclude-readonly filters sit on the L7b pool. Failures back off 30s, 60s, 2m, then a cap (default 5 min). Retry all touches the failed hosts only, with a 10s cooldown.
- **剧本分享包（W5）/ Playbook share pack.** `.aiss-playbooks` 可加密导出和导入。包里只有步骤、变量默认值和主机标题/标签。口令、私钥、令牌不进包。导入不绑定凭据、不自动运行。 / `.aiss-playbooks` exports and imports with optional encryption. The file keeps steps, variable defaults, and host title/tags. Passwords, keys, and tokens stay out. Import does not bind credentials or run anything.
- **写闸门时间线（S2b）/ Write-gate timeline.** 闸门决定写入现有审计日志，审计总开关关闭时仍然保留。只读阻止可以回放。时间线不能改保护级别。 / Gate decisions append to the existing audit log and stay when the audit switch is off. A read-only block can be replayed. The timeline does not change protection.
- **三步上手（UX-60）/ Three-step start.** 新配置文件最多三步到第一台主机。升级用户不自动进入。完整五步引导改到帮助里的「重看完整引导」。 / A new profile reaches the first host in at most three steps. Upgrades are not sent through it. The five-step tour is Help → Replay full tour.

## v0.4.3

Daily ops polish. Package version is `0.4.3`. Do not tag until QA signs off.

- **运维首页后台采样（L7b）/ Ops home sampling.** 设置里的自动采样默认开启。范围是当前分组；没有分组时用最近连接和置顶，否则只采前 N 台（默认 8，上限 30）。不必先开终端标签。已连接的主机会复用会话。失败只灰那一张卡，不刷密码框。关掉之后又只给已连接的主机画指标。 / Auto sampling is on by default. Scope is the current group; with no group it uses recent and pinned hosts, otherwise only the first N (default 8, cap 30). A terminal tab is not required. A live session is reused. A failure grays that card and does not ask for a password. Turning it off restores metrics for connected hosts only.
- **标签列表（UX-55b）/ Tab list.** 10 个以上标签时，⌄ 列表可以搜索。行上的 × 关闭该标签。有断开的终端时，页脚可以一次关掉它们并撤销。Ctrl+K「切换标签…」打开同一列表。标签条仍是 36px。 / At 10 tabs the ⌄ list can search. × closes that row. The footer closes disconnected terminals and can undo. Ctrl+K “Switch tab…” opens the same list. The strip stays 36px.
- **首周浮层（UX-57）/ First-week chip.** 「接下来可以」改到右下角，不盖健康卡和告警列表。知道了只在本次会话里收起；不再显示会记住。Esc 和点外面同样收起。1024 宽时变成底部一条。 / “Next up” sits at the bottom-right and leaves the health cards and alert list usable. Got it hides it for this session; Don’t show again is remembered. Esc and an outside click do the same. At 1024px it becomes a bottom bar.
- **告警行剧本（W1b）/ Alert row playbook.** 列表行悬停是定位、解读、⋯。右键和 ⋯ 都有「生成修复剧本」。已有修复建议就打开草稿；没有就先解读，不自动建草稿，按钮高亮约 2 秒。未配置 AI 时提示去配置。 / A row hover shows locate, interpret, and ⋯. The context menu and ⋯ both include Create fix playbook. Cached fixes open a draft; otherwise the row interprets and does not draft, and the button highlights for about 2 seconds. Without AI it asks you to configure it.
- **线性图标（UX-12b）/ Linear icons.** 工具栏、空状态、菜单勾选、行内图标不再用 emoji。`check-ux` 对界面文件做静态检查。 / Toolbar, empty states, menu checks, and row icons no longer use emoji. `check-ux` rejects them in the UI sources.
- **会话恢复（UX-50b）/ Session restore.** 关掉全部标签会记下空工作区，下次「上次会话」不会把旧标签找回来。恢复中的监控是居中的「正在恢复连接…」；超过约 20 秒或失败则是「无法自动连接」和「点击连接」。重连返回的会话号会绑到同主机的监控。 / Closing every tab stores an empty workspace, so Last session does not bring the old tabs back. A restoring monitor is centered “Restoring connection…”; after about 20 seconds, or on failure, it says it could not reconnect and offers Click to connect. The session id returned by reconnect is what the monitor binds.
- **演示主机名（UX-39b）/ Demo host name.** 侧栏、健康卡和终端标题跟着界面语言变。自己改过名字之后不再覆盖。没有标签时，标签条不再写「未打开会话」。 / The sidebar, health card, and terminal title follow the UI language. A rename sticks. With no tabs, the strip no longer says that no session is open.
- **主机菜单（UX-19b）/ Host menu.** 「档案与备注」是短标签，完整说法在提示里。多选「在看板中监控」带上数量。菜单靠近窗口底部时向上翻，删除仍可见。 / Profile & notes stays short; the full phrase is a tooltip. Monitor on board shows the count. Near the bottom of the window the menu flips up so Delete stays visible.

## v0.4.2

Alert to playbook draft, dry-run, rollback, and postmortem. Package version is `0.4.2`. Do not tag until QA signs off.

- **修复剧本草稿（W1）/ Fix playbook draft.** 告警解读卡的「生成修复剧本」在中间标签打开草稿，不连主机、不发命令。危险步骤锁定确认。同一告警再次生成会打开已有草稿。 / Create fix playbook opens a center-tab draft. It does not connect or send a command. Dangerous steps lock confirm. Generating again for the same alert focuses the existing draft.
- **试运行（W2）/ Dry run.** 运行前必须先试运行。`{{变量}}` 与试运行、正式运行共用同一套展开。只读主机可以勾选，试运行标「将被阻止」，真正执行仍跳过。 / A run requires a dry run first. `{{vars}}` expand with the same function for dry run and run. Read-only hosts can be selected, the dry run marks them blocked, and the real run still skips them.
- **文件快照（W3）/ Snapshots.** 编辑保存和文件夹同步覆盖前，在本机加密保存文本快照。可对比、钉住、回滚。回滚仍走写闸门；成功、阻止或取消都会写一条 `file` 审计和时间线 `file.rollback`。保留份数跟设置走。快照不进云同步。 / Editor saves and folder-sync overwrites keep an encrypted local text snapshot. Diff, pin, and roll back. Rollback still uses the write guard, then writes a `file` audit row and a `file.rollback` timeline event on success, block, or cancel. Keep count follows Settings. Snapshots stay out of cloud sync.
- **复盘（W4）/ Postmortem.** 告警时间线可导出 Markdown。主机、IP、用户默认替换成别名，命令输出和文件 diff 默认不写入。摘要是模板拼接，不调用 AI。 / The alert timeline exports Markdown. Host, IP, and user become aliases by default. Command output and file diffs stay out unless opted in. The summary is a template, not an AI call.
- **体验（UX-31b / UX-28 / UX-44b / UX-12a / UX-39 / UX-40）/ Polish.** 运维菜单可见项不超过 12，刷新 Docker 和告警历史仍可在 Ctrl+K 找到。命令片段先列表后编辑。终端块条高度可调，没有块时不占位。线性图标用内置 SVG。演示主机名跟随当前语言。空标签栏不再写「未打开会话」。 / The Ops menu shows at most 12 items. Refresh Docker and alert history stay in Ctrl+K. Snippets are list-first. The block strip height is adjustable and hidden when there are no blocks. Icons are built-in SVGs. The demo host name follows the current language. An empty tab bar no longer says “no session open”.

## v0.4.1

Jump hosts and the 1366 layout pass. Package version is `0.4.1`. Do not tag until QA signs off.

- **跳板机（L6）/ Jump hosts.** 链路图最多五跳（本机 → 跳板 → 目标）。失败横幅写明第几跳，并提供「编辑跳板机」「重试」；「检查密钥与证书…」在 ⋯ 里。分组跳板会先确认再覆盖。OpenSSH 用户证书会替换 ssh2 公钥并完成进程内握手。sk-ed25519 不能当普通私钥用，只能走 SSH Agent。 / The chain diagram shows at most five hops. The failure banner names the hop and offers Edit jump hosts and Retry; Check keys and certificates… sits in ⋯. Applying a jump host to a group asks before overwrite. An OpenSSH user certificate replaces the ssh2 public key and completes an in-process handshake. sk-ed25519 is refused as a raw key and must use an SSH agent.
- **1366 密度（UX-47 / UX-54 / UX-55）/ Density.** 运维首页和告警工作台仍用容器查询：1199 叠首页，1099 叠告警双栏，1040 时搜索独占第二行，约 900 起次要动作变成图标且「定位」留字。标签条固定 36px、无可见滚动条；标签高 30px 且等高。放不下时右端是 `⌄ n`（n 为未完整显示的个数），列表标题与标签条同一套文案。竖向滚轮改为横滚，两端有渐隐。 / Ops home and the alert workbench stay on container queries: 1199 stacks home, 1099 stacks the alert split, 1040 gives search its own row, and around 900 the secondary actions become icons while Locate keeps its label. The tab strip stays 36px with no visible scrollbar and 30px equal-height tabs. Overflow is `⌄ n` (tabs not fully in view); the list uses the same labels as the strip. A vertical wheel scrolls sideways, with a fade at each hidden edge.
- **运维首页深链（UX-52）/ Ops home links.** 右栏有「打开 SFTP」和「同步文件夹…」，不换行；窄栏时进页头 ⋯。没有会话时走主机选择器，以中心标签打开。 / The rail has Open SFTP and Sync folder…, nowrap, and they move into the header ⋯ when the rail collapses. With no session they use the host picker and open as center tabs.
- **设置（UX-13）/ Settings.** Ctrl+, 打开同一个设置标签。外观、终端、AI、快捷键、关于等入口跳到对应锚点，自动保存。 / Ctrl+, opens one settings tab. Appearance, terminal, AI, shortcuts, and about land on the same anchors. Changes save themselves.
- **命令面板（UX-11b）/ Command palette.** 空查询按固定类别分组，并钉住最多 5 个常用项。查询 sync 的顺序是：云同步…、立即同步、同步冲突、同步文件夹…、同步预览。 / An empty query groups by a fixed category order and pins up to five frequent commands. The query “sync” ranks Cloud sync…, Sync now, Sync conflict, Sync folder…, Sync preview.
- **最近连接（UX-18）/ Recent.** 侧栏「最近连接」默认折叠。同一 user@host:port 只留一行，已保存的主机带「已保存」，不再复制整棵主机树。 / Recent connections start collapsed. One row per user@host:port, with a Saved badge when the host is already in the list.
- **主机菜单（UX-19）/ Host menu.** 单选：连接、新标签、SFTP、监控、工具箱、编辑、档案与备注、重命名、移动、复制地址、删除（底部红色）。Docker 进工具箱，不再单独占一行。 / Single selection ends with a red Delete. Docker opens inside the toolbox instead of its own row. Profile & notes opens the host profile.
- **恢复上次会话（UX-50）/ Restore.** 启动「上次会话」现恢复运维首页、告警工作台、SFTP、监控、工具箱等中间标签及分屏布局；终端仅恢复标签并重连，不恢复 scrollback。失效档案会跳过并提示。启动「运维首页」不会把这些标签一起打开。 / Startup “Last session” restores Ops home, the alert workbench, SFTP, monitor, toolbox, and other center tabs. Terminals restore as a tab and reconnect; scrollback is not restored. A missing profile is skipped with a toast. Startup “Ops home” does not reopen those tabs.
- **冷启动 / Cold start.** 修复冷启动首次双击窗口不显示 / Fix main window not showing on first cold-start launch.
- **快速关闭 / Quick close.** 单实例锁只申请一次，失败立刻退出。关窗后约 1.5 秒内的重叠第二次启动不会再把窗口自己打开；超过 1.5 秒再点快捷方式仍会唤起（空闲保活不变）。 / The single-instance lock is requested once and a failure exits immediately. An overlapping second launch within about 1.5s of close no longer reopens the window by itself. A shortcut click after 1.5s still raises it (idle keep-alive unchanged).

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
