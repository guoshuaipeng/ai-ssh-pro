import type { MenuAction } from './menus'

/**
 * In-app "What's new" entries (V3). CHANGELOG.md holds the same release in markdown for GitHub Release notes (R1).
 * `where` tells the user where to find the feature; when `action` is set the entry is a clickable link.
 */
export type ChangelogEntry = {
  icon: string
  text: { zh: string; en: string }
  where?: { zh: string; en: string }
  action?: MenuAction
}

export const CHANGELOG: Readonly<Record<string, ReadonlyArray<ChangelogEntry>>> = {
  '0.4.10': [
    {
      icon: '▷',
      text: {
        zh: '主按钮改为实心强调色。工具标签用线性图标区分，不再用彩色左边条',
        en: 'Primary buttons are a solid accent. Tool tabs use a linear icon instead of a colored left bar'
      },
      where: { zh: '窗口', en: 'Window' }
    },
    {
      icon: '▷',
      text: {
        zh: '菜单、弹出层和对话框共用同一套阴影和抬升表面',
        en: 'Menus, popovers, and dialogs share one shadow and one elevated surface'
      },
      where: { zh: '窗口', en: 'Window' }
    },
    {
      icon: '▷',
      text: {
        zh: '空列表是一枚图标加一句话。关于页显示版本、更新通道，以及 GitHub 和 Gitee',
        en: 'An empty list is an icon and one sentence. About shows the version, update channel, GitHub, and Gitee'
      },
      where: { zh: '帮助 → 关于', en: 'Help → About' },
      action: 'about'
    },
    {
      icon: '▷',
      text: {
        zh: '标题栏、状态和提示条改用主题色，不再写死一套深色',
        en: 'The title bar, status, and banners follow the theme colors instead of a fixed dark palette'
      },
      where: { zh: '窗口', en: 'Window' }
    }
  ],
  '0.4.9': [
    {
      icon: '▷',
      text: {
        zh: '设置里可以选代理安全档：观察、确认、信任、全自动。默认是确认',
        en: 'Settings offer an agent safety tier: Observe, Confirm, Trusted, or Autopilot. Confirm is the default'
      },
      where: { zh: '设置 → AI', en: 'Settings → AI' },
      action: 'ai'
    },
    {
      icon: '▷',
      text: {
        zh: '只读命令可以自动执行。写入仍要同意。高风险要同意后再确认一次，不会自动执行',
        en: 'Read-only commands may auto-run. Writes still need Agree. High risk needs Agree and a second confirm, and does not auto-run'
      },
      where: { zh: 'AI 助手', en: 'AI assistant' },
      action: 'openAi'
    },
    {
      icon: '▷',
      text: {
        zh: '观察档对写入、删除和重启只给建议，不提供执行',
        en: 'Observe only suggests writes, deletes, and reboots. There is no execute button'
      },
      where: { zh: 'AI 助手', en: 'AI assistant' }
    },
    {
      icon: '▷',
      text: {
        zh: 'ncdu、top、vim、less 不会自动执行。同一条正在执行的命令不会再次询问同意',
        en: 'ncdu, top, vim, and less never auto-run. An in-flight command is not asked to Agree again'
      },
      where: { zh: 'AI 助手', en: 'AI assistant' }
    },
    {
      icon: '▷',
      text: {
        zh: '会话标签不再挤成「服…」。放不下时标签条横向滚动，主机名和 IP 保持可读',
        en: 'Session tabs no longer shrink to an unreadable stub. Extra tabs scroll sideways, and the host or IP stays readable'
      },
      where: { zh: '标签条', en: 'Tab strip' }
    },
    {
      icon: '▷',
      text: {
        zh: '标题栏右侧恢复会话栏、终端区和 AI 面板三枚小图标，开着略亮',
        en: 'The title bar again has three small icons for the sidebar, terminal, and AI panel'
      },
      where: { zh: '标题栏', en: 'Title bar' }
    }
  ],
  '0.4.8': [
    {
      icon: '▷',
      text: {
        zh: 'AI 回复改成深色卡片，并标出低、中、高风险',
        en: 'AI replies are dark cards, with a low, medium, or high risk badge'
      },
      where: { zh: 'AI 助手', en: 'AI assistant' },
      action: 'openAi'
    },
    {
      icon: '▷',
      text: {
        zh: '要执行的命令放在等宽条里，同意才写入终端，不同意不执行',
        en: 'A command sits in a monospace block. Agree writes it; Decline does not run it'
      },
      where: { zh: 'AI 助手', en: 'AI assistant' },
      action: 'openAi'
    },
    {
      icon: '▷',
      text: {
        zh: '工具步骤收成一行，不再铺成一堵字',
        en: 'Tool steps stay on one line instead of a wall of text'
      },
      where: { zh: 'AI 助手', en: 'AI assistant' }
    },
    {
      icon: '▷',
      text: {
        zh: '还没提问时只留一句提示，不再用灰色底板',
        en: 'Before the first question there is one sentence, not a grey plate'
      },
      where: { zh: 'AI 助手', en: 'AI assistant' }
    }
  ],
  '0.4.7': [
    {
      icon: '▷',
      text: {
        zh: '标题栏不再放三枚布局方块，会话栏、终端区和 AI 面板改在查看菜单里',
        en: 'The title bar no longer shows three layout squares. Sidebar, terminal, and AI panel live in the View menu'
      },
      where: { zh: '查看', en: 'View' }
    },
    {
      icon: '▷',
      text: {
        zh: '标签条右侧有一枚分屏按钮，默认仍是单窗格',
        en: 'The tab strip has one split button. The default stays a single pane'
      },
      where: { zh: '中间标签条', en: 'Center tab strip' },
      action: 'toggleSplit'
    },
    {
      icon: '▷',
      text: {
        zh: '标题栏溢出入口改成纯图标，只收少用操作',
        en: 'The title bar overflow control is an icon for less-used actions'
      },
      where: { zh: '标题栏', en: 'Title bar' }
    },
    {
      icon: '▷',
      text: {
        zh: '文件到帮助的菜单都还在，字重和悬停跟产品名同一套',
        en: 'File through Help stay on the menu bar, with type and hover aligned to the product name'
      },
      where: { zh: '标题栏菜单', en: 'Title bar menus' }
    }
  ],
  '0.4.6': [
    {
      icon: '▷',
      text: {
        zh: '工具箱的 Docker 按 Compose、Swarm 和容器分组，带状态点、数量和端口',
        en: 'Toolbox Docker groups Compose, Swarm, and containers, with status, counts, and ports'
      },
      where: { zh: '服务器工具箱 → Docker', en: 'Server toolbox → Docker' },
      action: 'serverTools'
    },
    {
      icon: '▷',
      text: {
        zh: '可以刷新、打开详情，以及启动、停止、重启；Compose 可 up/down，Swarm 可更新',
        en: 'Refresh, open details, and start, stop, or restart. Compose can go up or down, and Swarm can update'
      },
      where: { zh: '服务器工具箱 → Docker', en: 'Server toolbox → Docker' },
      action: 'serverTools'
    },
    {
      icon: '▷',
      text: {
        zh: '没有 Docker 或还没有容器时，用一枚图标和一句话说明',
        en: 'No Docker, or no containers yet, is an icon and one sentence'
      },
      where: { zh: '服务器工具箱 → Docker', en: 'Server toolbox → Docker' }
    },
    {
      icon: '▷',
      text: {
        zh: '删除容器、Compose 启动或停止、Swarm 更新和任务重启之前会先确认',
        en: 'Deleting a container, Compose up or down, a Swarm update, or a Swarm task restart asks first'
      },
      where: { zh: '服务器工具箱 → Docker', en: 'Server toolbox → Docker' }
    }
  ],
  '0.4.5': [
    {
      icon: '▷',
      text: {
        zh: '关于、标题栏和托盘共用产品名和图标',
        en: 'About, the title bar, and the tray share the product name and icon'
      },
      where: { zh: '帮助 → 关于', en: 'Help → About' },
      action: 'about'
    },
    {
      icon: '▷',
      text: {
        zh: '侧栏、文件、片段、转发和告警为空时，用一句话说明，最多一个主按钮',
        en: 'An empty sidebar, file list, snippet list, forward list, or alert list is one sentence and at most one primary'
      },
      where: { zh: '会话栏', en: 'Sidebar' }
    },
    {
      icon: '▷',
      text: {
        zh: '标签用图标区分种类，不再用彩色左边条',
        en: 'Tabs use an icon for each kind, not a colored left bar'
      },
      where: { zh: '中间标签条', en: 'Center tab strip' }
    },
    {
      icon: '▷',
      text: {
        zh: '菜单和弹出层共用同一套阴影，主按钮仍是实心的',
        en: 'Menus and popovers share one shadow, and primary buttons stay solid'
      },
      where: { zh: '标题栏菜单', en: 'Title bar menus' },
      action: 'commandPalette'
    },
    {
      icon: '▷',
      text: {
        zh: '助手的诊断回复按条目分成卡片，建议执行的命令单独列出',
        en: 'A diagnostic reply is split into cards, and a suggested command is listed on its own'
      },
      where: { zh: 'AI 助手', en: 'AI assistant' },
      action: 'openAi'
    },
    {
      icon: '▷',
      text: {
        zh: '主机右键「移动到」会展开目标分组',
        en: 'Move to on a host opens the list of groups'
      },
      where: { zh: '会话栏右键', en: 'Sidebar right-click' }
    }
  ],
  '0.4.4': [
    {
      icon: '▷',
      text: {
        zh: '告警规则可以一键套用 CPU、磁盘和 sshd 模板，只写入本机规则',
        en: 'Alert rules can apply CPU, disk, and sshd templates in one click. They only write local rules'
      },
      where: { zh: '命令面板 → 启用告警规则模板…', en: 'Command palette → Enable alert rule templates…' },
      action: 'enableRuleTemplates'
    },
    {
      icon: '▷',
      text: {
        zh: '后台采样可以按标签、仅生产或排除只读来缩小范围。失败的主机会退避后重试',
        en: 'Background sampling can filter by tag, production only, or exclude read-only. Failed hosts back off, then retry'
      },
      where: { zh: '设置 → 运维首页', en: 'Settings → Ops home' },
      action: 'retryFailedProbes'
    },
    {
      icon: '▷',
      text: {
        zh: '运维剧本可以导出加密分享包。口令、私钥和令牌不会写进包里',
        en: 'Playbooks can export an encrypted share pack. Passwords, keys, and tokens stay out of the file'
      },
      where: { zh: '运维剧本 → 导出分享包…', en: 'Playbooks → Export share pack…' },
      action: 'exportPlaybookPack'
    },
    {
      icon: '▷',
      text: {
        zh: '写闸门的决定会留在记录里。只读阻止可以回放，记录本身不能改保护级别',
        en: 'Write-gate decisions stay in a log. A read-only block can be replayed, and the log cannot change protection'
      },
      where: { zh: '命令面板 → 查看写闸门记录', en: 'Command palette → View write-gate log' },
      action: 'gateTimeline'
    },
    {
      icon: '▷',
      text: {
        zh: '新配置最多三步连上第一台主机。完整引导仍可在帮助里重看',
        en: 'A new profile reaches the first host in at most three steps. The full tour stays under Help'
      },
      where: { zh: '帮助 → 快速上手（3 步）', en: 'Help → Quick start (3 steps)' },
      action: 'quickStart'
    },
    {
      icon: '▷',
      text: {
        zh: '会话录像可以截一段导出 GIF 或带时间戳的 Markdown，不改原录像',
        en: 'A session recording can export a clip as a GIF or timestamped Markdown without changing the original'
      },
      where: { zh: '运维 → 会话录制', en: 'Ops → Session recordings' },
      action: 'sessionRecordings'
    },
    {
      icon: '▷',
      text: {
        zh: '运维首页收件箱的右键和 ⋯ 也能生成修复剧本，和告警工作台同一套判断',
        en: 'The Ops home inbox context menu and ⋯ can create a fix playbook, using the same decision as the workbench'
      },
      where: { zh: '运维首页 → 告警收件箱', en: 'Ops home → Alert inbox' },
      action: 'opsHome'
    },
    {
      icon: '▷',
      text: {
        zh: '跳板失败的那一跳会单独标出来。成功、探测中和尚未探测可以分开看',
        en: 'A failed jump hop is marked on its own. Success, probing, and not-yet-probed stay distinct'
      },
      where: { zh: '连接设置 → 跳板机', en: 'Connection settings → Jump hosts' },
      action: 'setJumpHosts'
    }
  ],
  '0.4.3': [
    {
      icon: '▷',
      text: {
        zh: '运维首页可以在后台看 CPU、内存和磁盘，不必先开终端',
        en: 'Ops home can sample CPU, memory, and disk in the background, without opening a terminal first'
      },
      where: { zh: '设置 → 运维首页', en: 'Settings → Ops home' },
      action: 'opsHome'
    },
    {
      icon: '▷',
      text: {
        zh: '告警列表的 ⋯ 和右键可以生成修复剧本。未配置 AI 时会提示去配置',
        en: 'An alert row’s ⋯ menu and right-click can create a fix playbook. Without AI it asks you to configure it'
      },
      where: { zh: '告警工作台 → 行菜单', en: 'Alert workbench → row menu' },
      action: 'alertWorkbench'
    },
    {
      icon: '▷',
      text: {
        zh: '关掉全部标签后再开，不会把上次的旧标签找回来',
        en: 'Closing every tab and reopening no longer brings the previous tabs back'
      },
      where: { zh: '设置 → 启动', en: 'Settings → Startup' },
      action: 'settings'
    },
    {
      icon: '▷',
      text: {
        zh: '演示主机的名字跟着界面语言变。空标签条不再写「未打开会话」',
        en: 'The demo host name follows the UI language. An empty tab strip no longer says that no session is open'
      },
      where: { zh: '侧栏 → 演示主机', en: 'Sidebar → Demo host' },
      action: 'opsHome'
    }
  ],
  '0.4.2': [
    {
      icon: '▷',
      text: {
        zh: '告警可以生成修复剧本草稿。草稿在中间标签里审阅，不会自动执行',
        en: 'An alert can become a fix-playbook draft. The draft opens in a center tab and never runs on its own'
      },
      where: { zh: '告警工作台 → 生成修复剧本', en: 'Alert workbench → Create fix playbook' },
      action: 'alertWorkbench'
    },
    {
      icon: '▷',
      text: {
        zh: '运行剧本前必须先试运行。变量会代入，只读主机会标成将被阻止',
        en: 'A playbook must be dry-run before it runs. Variables are filled in, and read-only hosts are marked as blocked'
      },
      where: { zh: '运维剧本 → 运行', en: 'Playbooks → Run' },
      action: 'runPlaybook'
    },
    {
      icon: '▷',
      text: {
        zh: '覆盖远端文件前在本机留快照，可以对比并回滚。回滚走写保护，并写入文件审计',
        en: 'A local snapshot is kept before a remote file is overwritten. Rollback still uses the write guard and writes a file audit row'
      },
      where: { zh: '设置 → 文件', en: 'Settings → Files' },
      action: 'settings'
    },
    {
      icon: '▷',
      text: {
        zh: '告警时间线和 Markdown 复盘。主机、IP 和用户默认隐藏',
        en: 'Alert timeline and a Markdown postmortem. Host, IP, and user are hidden by default'
      },
      where: { zh: '告警工作台 → 时间线', en: 'Alert workbench → Timeline' },
      action: 'alertWorkbench'
    },
    {
      icon: '▷',
      text: {
        zh: '运维菜单只留 12 项。命令片段先看列表，终端块高度可拖',
        en: 'The Ops menu keeps 12 items. Snippets open as a list, and the terminal block strip can be resized'
      },
      where: { zh: '运维 / 命令片段', en: 'Ops / Snippets' },
      action: 'snippets'
    }
  ],
  '0.4.1': [
    {
      icon: '⤳',
      text: {
        zh: '跳板机最多五跳，失败定位到某一跳。OpenSSH 用户证书可以真正完成认证；sk-ed25519 仍必须走 SSH Agent',
        en: 'Jump hosts support up to five hops, and a failure names the hop. OpenSSH user certificates authenticate for real; sk-ed25519 still goes through an SSH agent'
      },
      where: { zh: '新建连接 → 高级', en: 'New connection → Advanced' },
      action: 'connection'
    },
    {
      icon: '▦',
      text: {
        zh: '1366 下运维首页和告警工作台按内容宽度排布。标签条固定 36px，溢出用 ⌄ 和未显示个数，不显示滚动条',
        en: 'At 1366, Ops home and the alert workbench follow content width. The tab strip stays 36px, overflows with ⌄ and a hidden count, and hides the scrollbar'
      },
      where: { zh: '运维首页 / 告警工作台', en: 'Ops home / Alert workbench' },
      action: 'opsHome'
    },
    {
      icon: '⚙',
      text: {
        zh: '设置并成一个中心标签（Ctrl+,）。打开 SFTP 和同步文件夹在运维首页右侧',
        en: 'Settings is one center tab (Ctrl+,). Open SFTP and Sync folder live on the Ops home rail'
      },
      where: { zh: '设置', en: 'Settings' },
      action: 'settings'
    },
    {
      icon: '⌘',
      text: {
        zh: '命令面板按类别分组，并钉住常用项。最近连接默认折叠，不跟主机列表重复',
        en: 'The command palette groups by category and pins frequent commands. Recent connections start collapsed and do not repeat the host list'
      },
      where: { zh: 'Ctrl+K', en: 'Ctrl+K' },
      action: 'commandPalette'
    },
    {
      icon: '↺',
      text: {
        zh: '启动「上次会话」现恢复运维首页、告警工作台、SFTP、监控、工具箱等中间标签及分屏布局；终端仅恢复标签并重连，不恢复 scrollback。',
        en: 'Startup “Last session” restores Ops home, the alert workbench, SFTP, monitor, toolbox, and other center tabs. Terminals restore as a tab and reconnect; scrollback is not restored.'
      },
      where: { zh: '设置 → 常规', en: 'Settings → General' },
      action: 'startupSettings'
    },
    {
      icon: '▢',
      text: {
        zh: '修复冷启动首次双击窗口不显示',
        en: 'Fix main window not showing on first cold-start launch'
      },
      where: { zh: '启动应用', en: 'Launch the app' }
    },
    {
      icon: '▢',
      text: {
        zh: '快速关闭后，重叠的第二次启动不会再把窗口自己打开',
        en: 'After a quick close, an overlapping second launch no longer reopens the window by itself'
      },
      where: { zh: '关闭窗口', en: 'Close the window' }
    }
  ],
  '0.4.0': [
    {
      icon: '▣',
      text: { zh: '运维首页：主机健康、告警收件箱和快捷入口，新装默认打开', en: 'Ops home: host health, alert inbox, and shortcuts. New installs land here' },
      where: { zh: '查看 → 运维首页', en: 'View → Ops home' },
      action: 'opsHome'
    },
    {
      icon: '🔔',
      text: { zh: '告警工作台把定位和 AI 解读放在同一个标签里', en: 'Alert workbench combines locate and AI read in one tab' },
      where: { zh: '运维 → 告警工作台', en: 'Ops → Alert workbench' },
      action: 'alertWorkbench'
    },
    {
      icon: '🛡',
      text: { zh: '主机保护级别：普通、生产、只读；告警执行会遵守闸门', en: 'Host protection: normal, production, or read-only. Alert runs honor the gate' },
      where: { zh: '主机档案 → 生产防护', en: 'Host inventory → Production guard' },
      action: 'inventory'
    },
    {
      icon: '▶',
      text: { zh: '运维剧本：编辑步骤、并行或串行运行，生产主机仍要确认', en: 'Playbooks: edit steps, run in parallel or series, and production hosts still confirm' },
      where: { zh: '运维 → 运维剧本', en: 'Ops → Playbooks' },
      action: 'playbooks'
    },
    {
      icon: '☁',
      text: { zh: '云同步：私有 Gist 或 WebDAV，端到端加密，冲突在中心标签里处理', en: 'Cloud sync: private Gist or WebDAV, end-to-end encrypted, conflicts in a center tab' },
      where: { zh: '文件 → 云同步…', en: 'File → Cloud sync…' },
      action: 'cloudSync'
    },
    {
      icon: '▣',
      text: { zh: '终端输出分块默认关闭；开启后可折叠，关闭时滚动历史仍在', en: 'Terminal blocks are off by default. When on they fold; turning them off keeps scrollback' },
      where: { zh: '查看 → 输出分块', en: 'View → Output blocks' },
      action: 'toggleBlocks'
    },
    {
      icon: '≠',
      text: { zh: '文件夹同步预览可钉成中心标签，变更很多时自动钉住', en: 'Folder sync preview can pin as a center tab, and pins itself when there are many changes' },
      where: { zh: '会话 → 文件夹同步…', en: 'Session → Folder sync…' },
      action: 'folderSync'
    },
    {
      icon: '●',
      text: { zh: '审计日志可搜索导出；会话录制写成 asciicast，自动录制是真开关', en: 'The audit log is searchable and exportable. Recordings are asciicast, and auto-record is a real switch' },
      where: { zh: '运维 → 审计日志', en: 'Ops → Audit log' },
      action: 'auditLog'
    }
  ],
  '0.4.0-m2': [
    {
      icon: '▶',
      text: { zh: '运维剧本：编辑步骤、并行或串行运行，生产主机仍要确认', en: 'Playbooks: edit steps, run in parallel or series, and production hosts still confirm' },
      where: { zh: '运维 → 运维剧本', en: 'Ops → Playbooks' },
      action: 'playbooks'
    },
    {
      icon: '☁',
      text: { zh: '云同步：私有 Gist 或 WebDAV，端到端加密，冲突在中心标签里处理', en: 'Cloud sync: private Gist or WebDAV, end-to-end encrypted, conflicts in a center tab' },
      where: { zh: '文件 → 云同步…', en: 'File → Cloud sync…' },
      action: 'cloudSync'
    },
    {
      icon: '▣',
      text: { zh: '终端输出分块默认关闭；开启后可折叠，关闭时滚动历史仍在', en: 'Terminal blocks are off by default. When on they fold; turning them off keeps scrollback' },
      where: { zh: '查看 → 输出分块', en: 'View → Output blocks' },
      action: 'toggleBlocks'
    },
    {
      icon: '⇢',
      text: { zh: '最多五跳跳板，失败定位到某一跳。证书和 sk-ed25519 仍是实验能力，正式验收在 0.4.1', en: 'Up to five jump hops, with the failed hop named. Certificates and sk-ed25519 are experimental; formal acceptance is in 0.4.1' },
      where: { zh: '新建连接 → 高级', en: 'New connection → Advanced' },
      action: 'connection'
    },
    {
      icon: '≠',
      text: { zh: '文件夹同步预览可钉成中心标签，变更很多时自动钉住', en: 'Folder sync preview can pin as a center tab, and pins itself when there are many changes' },
      where: { zh: '会话 → 文件夹同步…', en: 'Session → Folder sync…' },
      action: 'folderSync'
    },
    {
      icon: '●',
      text: { zh: '审计日志可搜索导出；会话录制写成 asciicast，自动录制是真开关', en: 'The audit log is searchable and exportable. Recordings are asciicast, and auto-record is a real switch' },
      where: { zh: '运维 → 审计日志', en: 'Ops → Audit log' },
      action: 'auditLog'
    }
  ],
  '0.4.0-m1': [
    {
      icon: '▣',
      text: { zh: '运维首页：主机健康、告警收件箱和快捷入口，新装默认打开', en: 'Ops home: host health, alert inbox, and shortcuts. New installs land here' },
      where: { zh: '查看 → 运维首页', en: 'View → Ops home' },
      action: 'opsHome'
    },
    {
      icon: '🔔',
      text: { zh: '告警工作台把定位和 AI 解读放在同一个标签里', en: 'Alert workbench combines locate and AI read in one tab' },
      where: { zh: '运维 → 告警工作台', en: 'Ops → Alert workbench' },
      action: 'alertWorkbench'
    },
    {
      icon: '🛡',
      text: { zh: '主机保护级别：普通、生产、只读；告警执行会遵守闸门', en: 'Host protection: normal, production, or read-only. Alert runs honor the gate' },
      where: { zh: '主机档案 → 生产防护', en: 'Host inventory → Production guard' },
      action: 'inventory'
    },
    {
      icon: '▶',
      text: { zh: '启动时可打开运维首页、上次会话或空白；审计日志记录告警执行和危险命令', en: 'Startup can open Ops home, the last session, or a blank workspace. The audit log records alert runs and dangerous commands' },
      where: { zh: '查看 → 启动设置…', en: 'View → Startup settings…' },
      action: 'startupSettings'
    }
  ],
  '0.3.19': [
    {
      icon: '⬇',
      text: { zh: '更新通道：自动先 Gitee 再 GitHub，也可指定镜像；下载与检测同一来源', en: 'Update channel: Gitee then GitHub, or a mirror; download matches the source that was checked' },
      where: { zh: '文件 → 更新…', en: 'File → Updates…' },
      action: 'updateChannel'
    },
    {
      icon: '📍',
      text: { zh: '告警可定位到磁盘 / 进程 / 服务，通知点击会打开对应主机', en: 'Alerts locate disk, processes, or services; notification click focuses the host' },
      where: { zh: '运维 → 多主机看板', en: 'Ops → Multi-host dashboard' },
      action: 'dashboard'
    },
    {
      icon: '✨',
      text: { zh: 'AI 解读单台主机的告警和近期日志', en: 'AI reads one host’s alert plus recent logs' },
      where: { zh: '告警卡片 → AI 解读', en: 'Alert card → AI read' },
      action: 'dashboard'
    },
    {
      icon: '≠',
      text: { zh: '本机与远端文件只读对比，可跳到远端编辑器', en: 'Read-only local/remote diff, with a jump to the remote editor' },
      where: { zh: '会话 → SFTP 文件', en: 'Session → SFTP files' },
      action: 'sftp'
    },
    {
      icon: '▣',
      text: { zh: '1366 宽度下 SFTP 双栏默认紧凑，可改回舒适', en: 'SFTP dual pane is compact at 1366px; comfort density is available' },
      where: { zh: '查看 → SFTP 舒适密度', en: 'View → SFTP comfort density' },
      action: 'sftpComfort'
    },
    {
      icon: '📥',
      text: { zh: '导入 FinalShell / Xshell / MobaXterm / PuTTY / SSH config，先预览冲突', en: 'Import FinalShell, Xshell, MobaXterm, PuTTY, or SSH config with a conflict preview' },
      where: { zh: '文件 → 导入会话…', en: 'File → Import sessions…' },
      action: 'importSessions'
    },
    {
      icon: '☑',
      text: { zh: '引导结束后的入门任务卡，可关闭且不再显示', en: 'Getting-started cards after the tour; dismissible for good' },
      where: { zh: '帮助 → 入门任务', en: 'Help → Getting started tasks' },
      action: 'taskCards'
    }
  ],
  '0.3.18': [
    {
      icon: '⇄',
      text: { zh: 'SFTP 双栏：本机与远程并排，拖放传输，队列可暂停/续传', en: 'SFTP dual pane with drag-and-drop and a pausable transfer queue' },
      where: { zh: '会话 → SFTP 文件', en: 'Session → SFTP files' },
      action: 'sftp'
    },
    {
      icon: '↻',
      text: { zh: '文件夹同步：预览差异后加入传输队列，可保存同步方案', en: 'Folder sync: preview the diff, then queue it; save a profile to rerun' },
      where: { zh: '会话 → 文件夹同步…', en: 'Session → Folder sync…' },
      action: 'folderSync'
    },
    {
      icon: '⌘',
      text: { zh: '命令历史智能补全：输入栏 Tab 采纳；终端幽灵文字用 → 采纳，Tab 仍交给 shell', en: 'History completion: Tab in the command bar; terminal ghost text accepts with →, Tab stays with the shell' },
      where: { zh: '查看 → 智能补全', en: 'View → Smart completion' },
      action: 'smartComplete'
    },
    {
      icon: '✨',
      text: { zh: '命令栏 AI 模式改为行内前缀，高度保持 32px', en: 'Command-bar AI mode is an inline prefix and stays 32px tall' },
      where: { zh: '终端上方命令栏', en: 'Command bar above the terminal' }
    },
    {
      icon: '🤖',
      text: { zh: '未配置 AI 时只显示一张配置卡', en: 'Unconfigured AI shows a single setup card' },
      where: { zh: '查看 → AI 面板', en: 'View → AI panel' },
      action: 'openAi'
    },
    {
      icon: '👋',
      text: { zh: '新手引导卡片避开按钮，优先出现在右侧', en: 'Welcome tour cards avoid buttons and prefer the right side' },
      where: { zh: '帮助 → 新手引导', en: 'Help → Welcome tour' },
      action: 'tour'
    },
    {
      icon: 'Aa',
      text: { zh: '所有标签标题统一为正体', en: 'Every tab title uses an upright font' }
    },
    {
      icon: '●',
      text: { zh: '主机选择器标题去掉多余空格，并显示在线点和延迟', en: 'Host picker title spacing fixed; rows show online dot and latency' },
      where: { zh: '未连接时打开监控 / SFTP', en: 'Open Monitor or SFTP with nothing connected' },
      action: 'resourceMonitor'
    }
  ],

  '0.3.17': [
    {
      icon: '🔔',
      text: { zh: '阈值告警：看板标红 + 系统通知 + 规则/历史', en: 'Threshold alerts with dashboard badges and notifications' },
      where: { zh: '运维 → 告警规则… / 多主机看板', en: 'Ops → Alert rules… / Multi-host dashboard' },
      action: 'alertRules'
    },
    {
      icon: '📡',
      text: { zh: '多会话广播输入：选择目标标签同步键入', en: 'Multi-tab broadcast input with target picker' },
      where: { zh: '会话 → 广播输入（Ctrl+Alt+I）', en: 'Session → Broadcast input (Ctrl+Alt+I)' },
      action: 'toggleBroadcast'
    },
    {
      icon: '🩺',
      text: { zh: '多主机 AI 巡检报告（只读采集 + Markdown 报告）', en: 'Multi-host AI inspection report (read-only + Markdown)' },
      where: { zh: 'AI → 多主机巡检报告…', en: 'AI → Multi-host AI inspection…' },
      action: 'aiInspect'
    },
    {
      icon: '📝',
      text: { zh: '远程编辑语法高亮，保存前可看 diff', en: 'Remote editor syntax highlight + diff before save' },
      where: { zh: 'SFTP 双击文本文件', en: 'SFTP: double-click a text file' },
      action: 'sftp'
    },
    {
      icon: '🖥',
      text: { zh: '窄窗口标题栏逐级收纳；「新建连接」文字始终可见', en: 'Responsive titlebar; New connection label always visible' }
    },
    {
      icon: '💬',
      text: { zh: 'IPC 错误去掉前缀并映射为人话', en: 'Friendly IPC error messages without Electron prefixes' }
    },
    {
      icon: '拼音',
      text: { zh: '命令面板支持拼音/别名搜索（如 xunjian、gaojing）', en: 'Command palette pinyin / alias search' },
      action: 'commandPalette'
    },
    {
      icon: '✅',
      text: { zh: '发版前 ux-audit 静态门禁', en: 'ux-audit static gate before release' }
    },
    {
      icon: '🗺',
      text: { zh: '修复：多主机看板标签页现在会真正渲染内容', en: 'Fix: multi-host dashboard tab actually renders' },
      action: 'dashboard'
    }
  ],

  '0.3.16': [
    {
      icon: '🔎',
      text: { zh: '标题栏搜索框文字不再被竖直裁切', en: 'Titlebar search label no longer clipped vertically' },
      where: { zh: '标题栏右侧「搜索功能… Ctrl+K」', en: 'Titlebar search button' }
    },
    {
      icon: '➕',
      text: { zh: '新建连接始终空白表单，不带入侧栏选中主机；智能填表置顶', en: 'New connection always blank; smart fill moved to top' },
      where: { zh: '＋ 新建连接', en: '+ New connection' },
      action: 'connection'
    },
    {
      icon: '📋',
      text: { zh: '主机档案页重设计：概览头、只读基本信息、紧凑服务列表、备注预览', en: 'Host profile redesign: overview header, read-only basics, compact services, notes preview' },
      where: { zh: '主机右键 → 主机档案', en: 'Host right-click → Host profile' },
      action: 'inventory'
    },
    {
      icon: '🧰',
      text: { zh: '工具箱危险操作默认隐藏，日志页自动读取', en: 'Toolbox dangerous actions hidden until hover; Logs auto-load' },
      action: 'serverTools'
    },
    {
      icon: '📈',
      text: { zh: '监控趋势图更大更清晰，超 85% 标红警告', en: 'Larger monitor trend charts with 85% warning' },
      action: 'resourceMonitor'
    },
    {
      icon: '✨',
      text: { zh: '命令栏默认收起，点右下角 ✨ 展开', en: 'Command bar collapsed by default; expand with the ✨ button' }
    },
    {
      icon: '🗺',
      text: { zh: '多主机监控看板：一屏看 CPU/内存/磁盘', en: 'Multi-host dashboard: CPU/mem/disk cards at a glance' },
      where: { zh: '运维 → 多主机看板（Ctrl+Alt+M）', en: 'Ops → Multi-host dashboard (Ctrl+Alt+M)' },
      action: 'dashboard'
    },
    {
      icon: '🖱',
      text: { zh: '输入框与终端统一右键菜单', en: 'Unified right-click menus for inputs and the terminal' }
    },
    {
      icon: '📁',
      text: { zh: '演示主机 SFTP 显示模拟文件树，写操作置灰', en: 'Demo host SFTP shows a simulated tree; writes disabled' },
      action: 'demoHost'
    }
  ],

  '0.3.15': [
    {
      icon: '🧰',
      text: { zh: '服务器工具箱所有入口都在中间标签页打开（工具箱 · 主机），不再弹窗', en: 'Every server toolbox entry opens a center tab (Toolbox · host), no more dialog' },
      where: { zh: '运维 → 服务器工具箱（Ctrl+Alt+T）', en: 'Ops → Server toolbox (Ctrl+Alt+T)' },
      action: 'serverTools'
    },
    {
      icon: '🔀',
      text: { zh: '端口转发、批量执行也改为标签页', en: 'Port forwarding and Batch run open as tabs too' }
    },
    {
      icon: '🎯',
      text: { zh: '主机右键刚连上就打开监控/工具箱时，指向正确的主机', en: 'Host right-click Monitor / Toolbox targets the right host right after connecting' }
    },
    {
      icon: '📑',
      text: { zh: '标签很多时在标签栏内滚动，关闭工具标签回到对应主机终端', en: 'Many tabs scroll inside the tab bar; closing a tool tab returns to its host' }
    }
  ],

  '0.3.14': [
    {
      icon: '📑',
      text: { zh: '监控与工具箱改为中间标签页打开，同一主机不重复', en: 'Monitor and toolbox open as center tabs (deduped per host)' }
    },
    {
      icon: '🧰',
      text: { zh: '极简默认工具栏：新建连接 · 监控 · 工具箱 · SFTP · 搜索', en: 'Minimal default toolbar: New · Monitor · Toolbox · SFTP · Search' }
    },
    {
      icon: '🔐',
      text: { zh: '新建连接占位改用文档 IP 192.0.2.10，单列分组表单', en: 'Connection placeholder uses documentation IP 192.0.2.10; single-column form' }
    },
    {
      icon: '🤖',
      text: { zh: 'AI 面板未配置时默认收起并显示配置空状态；默认宽度 320px', en: 'AI panel collapses when unconfigured with empty-state; default width 320px' }
    },
    {
      icon: '📁',
      text: { zh: 'SFTP 工具条与文件行不换行', en: 'SFTP toolbar and file rows no longer wrap' }
    }
  ],  '0.3.13': [
    {
      icon: '🧪',
      text: { zh: '内置演示主机：不用服务器也能试终端、资源监控和工具箱（数据为模拟）', en: 'Built-in demo host: try the terminal, monitor and toolbox without a server (simulated data)' },
      where: { zh: '帮助 → 试用演示主机', en: 'Help → Try demo host' },
      action: 'demoHost'
    },
    {
      icon: '🧭',
      text: { zh: '5 步新手引导，随时可以跳过或重看', en: 'A 5-step welcome tour you can skip or replay any time' },
      where: { zh: '帮助 → 新手引导', en: 'Help → Welcome tour' },
      action: 'tour'
    },
    {
      icon: '✨',
      text: { zh: 'AI 解释报错：命令失败时点「✨ AI 解释」，给出原因和修复命令，可插入或确认后执行', en: 'Explain errors with AI: click "✨ Explain with AI" when a command fails to get the cause and fix commands to insert or run' },
      where: { zh: '终端右下角 / 终端右键 / AI → AI：解释最近的错误', en: 'Terminal corner / terminal right-click / AI → AI: Explain the last error' },
      action: 'aiExplainError'
    },
    {
      icon: '💬',
      text: { zh: '用自然语言生成命令：命令栏输入 # 或按 Ctrl+Shift+Space，带风险标记，执行前确认', en: 'Natural language → command: type # in the command bar or press Ctrl+Shift+Space; risk-labelled and confirmed before running' },
      where: { zh: '命令栏 / AI → 用自然语言生成命令', en: 'Command bar / AI → Natural language → command' },
      action: 'aiCommand'
    },
    {
      icon: '🧹',
      text: { zh: '体验打磨：统一的确认弹窗、空状态引导、未连接时先选主机、广播/录制状态一眼可见、菜单命名统一', en: 'Polish: one dialog style, helpful empty states, host picker when nothing is connected, visible broadcast/recording state, consistent names' }
    }
  ],
  '0.3.12': [
    {
      icon: '🏷',
      text: { zh: '标题栏显示当前版本号，点击查看更新内容', en: 'The title bar shows the current version; click it to see what is new' },
      where: { zh: '标题栏 → 版本号', en: 'Title bar → version' }
    },
    {
      icon: '⬆',
      text: { zh: '自动提示新版本，可下载、稍后或跳过此版本', en: 'New versions are announced automatically: download, later, or skip' },
      where: { zh: '帮助 → 检查更新…', en: 'Help → Check for updates…' },
      action: 'checkUpdate'
    },
    {
      icon: '🖱',
      text: { zh: '主机右键直接打开 SFTP、资源监控、服务器工具箱，多选可批量执行', en: 'Right-click a host to open SFTP, monitor or toolbox; multi-select to batch run' },
      where: { zh: '会话栏 → 右键主机（Ctrl/Shift 多选）', en: 'Sidebar → right-click a host (Ctrl/Shift to multi-select)' }
    },
    {
      icon: '🟢',
      text: { zh: '主机在线状态与延迟，连接前先看一眼', en: 'Host online status and latency before you connect' },
      where: { zh: '查看 → 显示主机在线状态', en: 'View → Show host status' }
    },
    {
      icon: '⌨',
      text: {
        zh: '快捷键调整：SFTP→Ctrl+Alt+F，工具箱→Ctrl+Alt+T，侧栏→Ctrl+Alt+1；终端里 Ctrl+B 等按键交还给 shell（tmux 可用），Ctrl+Shift+F 终端内查找',
        en: 'Shortcut changes: SFTP→Ctrl+Alt+F, toolbox→Ctrl+Alt+T, sidebar→Ctrl+Alt+1; Ctrl+B etc. now reach the shell (tmux works); Ctrl+Shift+F finds in terminal'
      },
      where: { zh: '帮助 → 键盘快捷键 (F1)', en: 'Help → Keyboard shortcuts (F1)' },
      action: 'shortcuts'
    },
    {
      icon: '🧭',
      text: { zh: '菜单重排为 文件/编辑/查看/会话/运维/AI/帮助，开关项显示勾选；工具栏分组更清爽', en: 'Menus reorganised into File/Edit/View/Session/Ops/AI/Help with check marks; a tidier grouped toolbar' },
      where: { zh: '查看 → 命令面板 (Ctrl+K)', en: 'View → Command palette (Ctrl+K)' },
      action: 'commandPalette'
    }
  ]
}

export function changelogFor(version: string): ReadonlyArray<ChangelogEntry> {
  let v = version.replace(/^v/i, '')
  while (v) {
    const hit = CHANGELOG[v]
    if (hit) return hit
    const cut = v.replace(/-[^-]+$/, '')
    if (cut === v) break
    v = cut
  }
  return []
}
