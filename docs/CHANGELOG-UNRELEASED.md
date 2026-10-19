# Unreleased — local iteration 2026-10-16 (CST)

### M222 — Playbook edit open toast (0.6.36)
- 剧本列表点编辑时 toast 提示已打开编辑页（与运行一致）。


### M221 — Split need-two toast (0.6.35)
- 开启分屏时若连接会话不足 2 个 toast 提示，不再空开分屏。


### M220 — Broadcast targets need-two toast (0.6.34)
- 选择广播目标时若连接会话不足 2 个 toast 提示，不再打开空选择器。


### M219 — Broadcast need-two toast (0.6.33)
- 开启广播时若连接会话不足 2 个 toast「至少需要 2 个会话才能广播」，不再打开空选择器。


### M218 — Elevate already-unlocked toast (0.6.32)
- 临时解除保护时若已在解除窗口内 toast 提示，不再重复弹确认。


### M217 — Recent connect matched toast (0.6.31)
- 从最近连接点选且命中已存档案时 toast「正在连接…」，不再静默开连。


### M216 — Focus existing session toast (0.6.30)
- 打开已有主机会话时若标签已打开，toast「已切换到已打开的会话」，不再静默切页。


### M215 — Reconnect-all busy toast (0.6.29)
- 「重连全部已断开」在已有重连进行中时 toast 提示，不再静默。


### M214 — Recent connect need-creds toast (0.6.28)
- 从最近连接打开且无已存档案时 toast 提示补全密码/密钥，不再静默填表。


### M213 — Elevate already-normal toast (0.6.27)
- 临时解除保护时若已是普通级别 toast「当前不是只读会话」，不再静默。


### M212 — S4 unlock need-profile toast (0.6.26)
- 只读拦截条「临时解除」在无主机档案时 toast 提示，不再静默。


### M211 — S4 copy command toast (0.6.25)
- 只读拦截条「复制命令」成功后 toast「已复制」，不再静默。


### M210 — Playbook run open toast (0.6.24)
- 从剧本列表打开运行面板时 toast 提示，不再静默。


### M209 — Demo host already exists toast (0.6.23)
- 再次添加演示主机（不连接）时若已存在 toast 提示，不再静默。


### M208 — Monitor profile connect fail toast (0.6.22)
- 从主机打开资源监控时若连接失败 toast 错误提示，不再只显示「已打开监控」后静默。


### M207 — Open SFTP from host fail toast (0.6.21)
- 从主机打开 SFTP 若未能创建标签时 toast 错误提示，不再静默失败。


### M206 — Sidebar key empty toast (0.6.20)
- 侧栏未选主机时按 Enter/F2/Delete toast 提示，不再静默。


### M205 — Maintenance event open toast (0.6.19)
- 通过 aiss-maintenance-open 事件打开维护窗口时 toast 提示，不再静默。


### M204 — Jump/certs/note empty toast (0.6.18)
- 跳板/证书/备注编辑在未选主机时 toast 提示，不再打开空白连接表单。


### M203 — Copy connection string empty toast (0.6.17)
- 复制连接串在无会话/未选主机时 toast 提示，避免复制出 root@host:22 占位串。


### M202 — Close tabs to right empty toast (0.6.16)
- 「关闭右侧标签」在无活动标签时 toast「未打开会话」，不再静默。


### M201 — Close other tabs empty toast (0.6.15)
- 「关闭其他标签」在无活动标签时 toast「未打开会话」，不再静默。


### M200 — Rename profile success toast (0.6.14)
- 重命名主机连接成功后 toast「已重命名为…」，不再静默。


### M199 — Session menu inventory toast (0.6.13)
- 主机右键打开主机档案时 toast「主机档案」，不再静默。


### M198 — Session menu edit connection toast (0.6.12)
- 主机右键编辑连接时 toast「编辑连接」，不再静默。


### M197 — Session menu toolbox toast (0.6.11)
- 主机右键打开工具箱时 toast 提示，不再静默。


### M196 — Monitor profile toast (0.6.10)
- 从主机打开资源监控时 toast 提示，不再静默。


### M195 — Open SFTP from host toast (0.6.9)
- 从主机打开 SFTP 时 toast 提示，不再静默。


### M194 — Session menu monitor board toast (0.6.8)
- 主机右键打开多主机看板时 toast 提示，不再静默。


### M193 — Session menu batch toast (0.6.7)
- 主机右键打开批量执行时 toast 提示，不再静默。


### M192 — Session menu maintenance toast (0.6.6)
- 主机右键「维护窗口」打开时 toast 提示，不再静默。


### M191 — Sync preview open toast (0.6.5)
- 固定打开文件夹同步预览时 toast 提示，不再静默。


### M190 — Playbook result open toast (0.6.4)
- 打开剧本运行结果面板时 toast 提示，不再静默。


### M189 — Recording play open toast (0.6.3)
- 打开会话录制回放时 toast 提示，不再静默。


### M188 — Diff playbook empty fixes toast (0.6.2)
- 从 diff 起草剧本时若无修复步骤 toast 提示，不再静默打开空编辑。


### M187 — Rename folder missing toast (0.6.1)
- 重命名分组时若分组已不存在 toast「找不到该分组」，不再误报已重命名。


### M186 — AI postmortem open toast (0.6.0)
- 打开 AI 复盘摘要面板时 toast 提示，不再静默。


### M185 — Postmortem open toast (0.5.99)
- 打开告警复盘面板时 toast 提示，不再静默。


### M184 — File history open toast (0.5.98)
- 打开文件版本历史面板时 toast「版本历史」，不再静默。


### M183 — Rename tab missing toast (0.5.97)
- 重命名标签时若标签已不存在 toast「未打开会话」，不再静默。


### M182 — Edit tags missing toast (0.5.96)
- 编辑主机标签时若主机已不存在 toast「找不到这台主机」，不再静默。


### M181 — Delete folder missing toast (0.5.95)
- 删除分组时若分组已不存在 toast 提示，不再弹出空名称确认框。


### M180 — Ctrl+Tab empty toast (0.5.94)
- 无标签时 Ctrl+Tab 切换 toast「未打开会话」，不再静默。


### M179 — Delete profiles empty toast (0.5.93)
- 删除主机档案在未选中任何项时 toast 提示，不再静默。


### M178 — Apply import empty toast (0.5.92)
- 确认导入时若无预览数据 toast「没有可导入的会话」，不再静默。


### M177 — Local shell fail toast (0.5.91)
- 打开本机 Shell 失败时除 setError 外再 toast，避免只埋在错误条。


### M176 — Export sessions toast (0.5.90)
- 导出会话（JSON/OpenSSH）成功时 toast，失败时除 setError 外再 toast。


### M175 — Stop recording catch toast (0.5.89)
- 停止录制抛错时除 setError 外再 toast，避免只埋在错误条。


### M174 — Start recording catch toast (0.5.88)
- 开始录制抛错时除 setError 外再 toast，避免只埋在错误条。


### M173 — Need SSH for Docker toast (0.5.87)
- 打开 Docker 时若无可用 SSH 会话，除 setError 外再 toast，避免只埋在错误条。


### M172 — Need SSH for SFTP toast (0.5.86)
- 打开 SFTP 时若无可用 SSH 会话，除 setError 外再 toast，避免只埋在错误条。


### M171 — Parse SSH paste fail toast (0.5.85)
- 智能粘贴解析失败时除 setError 外再 toast，避免只埋在错误条。


### M170 — Save profile need-host toast (0.5.84)
- 保存主机档案缺主机/用户名时除 setError 外再 toast，避免只埋在错误条。


### M169 — Parse SSH paste empty toast (0.5.83)
- 智能粘贴解析在输入为空时 toast 提示，不再静默。


### M168 — Start recording fail toast (0.5.82)
- 开始录制失败时除 setError 外再 toast「无法开始录制」，避免只埋在错误条里。


### M167 — Stop recording empty toast (0.5.81)
- 停止录制在无进行中录制时 toast 提示，不再静默。


### M166 — Pin tab empty toast (0.5.80)
- 固定/取消固定标签在无活动标签时 toast「未打开会话」，不再静默。


### M165 — Settings menu open toasts (0.5.79)
- AI 设置 / 终端外观 / 界面主题菜单打开对应设置页时 toast 提示，不再静默。


### M164 — MCP setup guide menu toast (0.5.78)
- 「MCP 安装指南…」菜单打开设置时 toast 提示，不再静默。


### M163 — Clear host history empty toast (0.5.77)
- 清除本主机命令历史在无记录时 toast 提示，不再显示「已清除 0 条」。


### M162 — AI inspect menu toast (0.5.76)
- 「多主机巡检报告…」菜单打开巡检对话框时 toast 提示，不再静默。


### M161 — Refill ask empty toast (0.5.75)
- AI「填回上一问」在找不到用户消息时 toast 提示，不再只静默聚焦输入框。


### M160 — Retry last ask empty toast (0.5.74)
- AI「重试上一问」在无用户消息时 toast 提示，不再静默。


### M159 — Update channel menu toast (0.5.73)
- 「更新…」菜单打开关于/更新通道设置时 toast 提示，不再静默。


### M158 — AI undo empty toast (0.5.72)
- AI 撤回上一轮在对话为空时 toast 提示，不再静默。


### M157 — Clear chat already-empty toast (0.5.71)
- 清空对话在已是空对话时 toast 提示，不再弹出确认框。


### M156 — Snippets / reconnect policy open toasts (0.5.70)
- 打开命令片段、重连策略设置时 toast 提示（启用已有 `menu.snippets` / `l9.section`）。


### M155 — Open AI reveal toast (0.5.69)
- 打开 AI 面板时若原先隐藏会展开并 toast（与聚焦 AI 面板一致）。


### M154 — Close tab empty toast (0.5.68)
- 关闭标签在无活动标签时 toast「未打开会话」，不再静默。


### M153 — Ask again empty toast (0.5.67)
- 「重新提问」在没有上一条用户问题时 toast 提示，不再只空聚焦输入框。


### M152 — Open all tabs empty toast (0.5.66)
- 「全部标签」在无打开标签时 toast「未打开会话」，与切换标签一致。


### M151 — Tour/welcome/settings/about open toasts (0.5.65)
- 打开新手引导、快速开始、再次欢迎、关于、设置时 toast 提示。


### M150 — Find with no session toast (0.5.64)
- 终端查找在无活动会话时 toast 错误提示，不再静默无效。


### M149 — Language toggle toast (0.5.63)
- 切换界面语言后 toast 显示当前语言（启用已有 `toolbar.localeTitle`）。


### M148 — Connection/settings/tools open toasts (0.5.62)
- 打开主机密钥、启动设置、新建连接、端口转发、资源监控、批量执行、工具箱、命令面板时 toast 提示。


### M147 — Tools panels open toasts (0.5.61)
- 打开传输队列、审计日志、剧本、云同步、会话录制、快捷键、备份、广播目标时 toast 提示。


### M146 — Inventory / SFTP / folder sync / cloud sync open toasts (0.5.60)
- 打开主机档案、SFTP、同步文件夹、云同步时 toast 提示（启用已有 menu/toolbar 文案）。


### M145 — Dry-run reminder / prod protection open toasts (0.5.59)
- 打开试运行提醒筛选、编辑保护级别时 toast 提示（启用已有 `w6.set` / `s2b.openProtection`）。


### M144 — Ops home / maintenance / sync conflicts open toasts (0.5.58)
- 打开运维首页、维护窗口、同步冲突时 toast 提示（启用已有 `l2d.open` 等文案）。


### M143 — Ops/alert panel open toasts (0.5.57)
- 打开看板、告警工作台、告警历史、告警规则时 toast 提示（启用已有 `l7.open*` / `o2.*Title`）。


### M142 — Alert rule templates open toast (0.5.56)
- 打开告警规则模板时 toast 提示。


### M141 — Open Docker toasts (0.5.55)
- 打开 Docker：无会话时 toast 请选主机；有会话时 toast 显示主机名。


### M140 — Built-in snippets/playbooks open toasts (0.5.54)
- 打开内置命令片段 / 内置运维剧本时 toast 提示。


### M139 — Gate timeline open toast (0.5.53)
- 打开闸门时间线时 toast 提示。


### M138 — What's New open toast (0.5.52)
- 打开「更新内容」时 toast 提示（启用已有 `about.whatsNew`）。


### M137 — Playbook pack import/export open toasts (0.5.51)
- 打开导出/导入剧本分享包流程时 toast 提示。


### M136 — Docker refresh toasts (0.5.50)
- 刷新 Docker 开始时 toast 显示主机名；无 SSH 会话时 toast 错误提示（不只 setError）。


### M135 — Open GitHub toast (0.5.49)
- 打开 GitHub 仓库前 toast 提示（启用已有 `toolbar.openGithub`）。


### M134 — Audit log cleared toast (0.5.48)
- 确认清空审计日志后 toast 提示。


### M133 — Audit export open toast (0.5.47)
- 打开「导出审计（合规）」对话框时 toast 提示。


### M132 — Focus AI panel reveal toast (0.5.46)
- 聚焦 AI 面板且原先隐藏时 toast 提示（启用已有 `ai.focusShortcutTip`）。


### M131 — Getting started tasks reopened toast (0.5.45)
- 菜单「入门任务」重新打开首周任务时 toast 提示。


### M130 — Import empty toast (0.5.44)
- 导入会话 / SSH config 无条目时除侧栏提示外再 toast，避免漏看。


### M129 — Demo host add/open toasts (0.5.43)
- 试用演示主机：首次添加并打开、再次打开、仅添加时均有 toast 提示。


### M128 — Connection deleted toast (0.5.42)
- 确认删除连接后 toast 显示名称或删除数量。


### M127 — Connection profile saved toast (0.5.41)
- 保存连接档案后 toast 显示连接名，不再静默。


### M126 — Move host to folder toasts (0.5.40)
- 将主机移入分组或移出分组后 toast 提示数量与分组名。


### M125 — Profile tags saved/cleared toast (0.5.39)
- 编辑主机标签保存后 toast 显示标签列表；清空时提示已清除。


### M124 — Folder/group deleted toast (0.5.38)
- 确认删除会话分组后 toast 显示分组名。


### M123 — Folder/group renamed toast (0.5.37)
- 重命名会话分组成功后 toast 显示新名称。


### M122 — New folder/group created toast (0.5.36)
- 新建会话分组成功后 toast 显示分组名。


### M121 — Local shell opened toast (0.5.35)
- 成功打开本机 Shell 时 toast 提示。


### M120 — Layout pane toggle toasts (0.5.34)
- 切换侧栏/终端区/AI 面板显隐时 toast 提示（启用已有 `toolbar.show/hide*` 文案）。


### M119 — SFTP comfort density toasts (0.5.33)
- 菜单切换 SFTP 舒适密度时 toast 提示开启/恢复默认（与状态栏一致）。


### M118 — Output blocks on toast (0.5.32)
- 开启输出分块时也 toast 提示（原先仅关闭时有提示）。


### M117 — Broadcast off toast (0.5.31)
- 菜单关闭广播输入时 toast「已关闭广播」，不再静默。


### M116 — Host status toggle toasts (0.5.30)
- 切换「显示主机在线状态」时 toast 提示已显示/已隐藏。


### M115 — Split toggle menu toasts (0.5.29)
- 菜单切换分屏时 toast 提示开启/退出（与状态栏一致；退出时若顺带关闭广播会说明）。


### M114 — Session recording start/stop toasts (0.5.28)
- 开始/停止会话录制时 toast 显示主机名；无会话时提示需要会话。


### M113 — Close other/right tabs toasts (0.5.27)
- 关闭其他/右侧标签：无可关时 toast 提示；成功时显示关闭数量（启用已有 `tab.closeRightDisabled`）。


### M112 — Reconnect toast with host (0.5.26)
- 菜单/快捷键重连开始时 toast 显示主机名（与复制会话一致）。


### M111 — Duplicate session toast with host (0.5.25)
- 复制会话开始时 toast 显示主机名。


### M110 — Clear scrollback toast shows host (0.5.24)
- 清空回滚缓冲成功 toast 带上主机/标签名。


### M109 — End maintenance action (0.5.23)
- Tools/CmdK **结束维护…**：无窗口/多窗口时提示并打开面板；仅一个活动窗口时确认后结束。


### M108 — AI undo/retry busy toast (0.5.22)
- 生成中撤回/重试时 toast 提示先停止生成，不再静默。


### M107 — Clear AI chat busy toast (0.5.21)
- 生成中清空对话时 toast 提示先停止生成，不再静默。


### M106 — Switch tab empty toast (0.5.20)
- **切换标签** 在无打开标签时 toast「未打开会话」，不再弹出空列表。


### M105 — Switch tab CmdK (0.5.19)
- View/CmdK **切换标签…**（打开标签列表；handler 已有）。


### M104 — Cut in Edit menu (0.5.18)
- 编辑菜单/CmdK **剪切**（handler 已有）。


### M103 — Batch connect toast covers partial / single (0.5.17)
- 批量连接结束：部分失败（含仅 1 台失败）与单台成功也会给出汇总 toast。


### M102 — Batch connect toasts list hosts (0.5.16)
- 批量连接成功/多失败 toast 列出主机名（多时截断）。


### M101 — Batch connect group CmdK (0.5.15)
- File/CmdK **连接当前分组…**（连接侧栏当前主机所在分组；handler 已有）。


### M100 — Batch connect selected CmdK (0.5.14)
- File/CmdK **连接选中主机…**（侧栏多选/当前选中；handler 已有）。


### M99 — Read-only session CmdK + already-state toasts (0.5.13)
- Session/CmdK **开启/关闭只读会话**；已是目标状态时 toast 提示，不再静默。


### M98 — Retry failed probes CmdK (0.5.12)
- View/CmdK **重试失败采样**（无首页/无失败项 toast 已有；handler 已有）。


### M97 — Refresh home health CmdK (0.5.11)
- View/CmdK **刷新首页健康**（未打开运维首页时已有 toast；handler 已有）。


### M96 — Toggle block strip in View + toast (0.5.10)
- View/CmdK **输出分块条**；切换时 toast 提示收起/展开。


### M95 — Alert rule templates CmdK (0.5.9)
- Tools/CmdK **告警规则模板…**（打开告警规则并切到模板段；handler 已有）。


### M94 — Dry-run fires after opening run tab (0.5.8)
- **剧本演练** 在尚未打开运行页时，打开剧本运行后也会触发 dry-run（不再只开页不演练）。


### M93 — Dry-run playbook CmdK (0.5.7)
- Tools/CmdK **剧本演练（Dry-run）…**（打开/聚焦剧本运行并演练；handler 已有）。


### M92 — Refresh Docker visible in menus (0.5.6)
- Tools 菜单显示 **刷新 Docker**（原先仅 CmdK 可搜）。


### M91 — Multi-host dashboard visible in menus (0.5.5)
- Tools 菜单显示 **多主机看板**（原先仅 CmdK 可搜）。


### M90 — Export audit visible in menus (0.5.4)
- Tools 菜单显示 **导出审计（合规）**（原先仅 CmdK 可搜）。


### M89 — Audit log visible in menus (0.5.3)
- Tools 菜单显示 **审计日志**（原先仅 CmdK 可搜）。


### M88 — Alert history visible in menus (0.5.2)
- Tools 菜单显示 **告警历史**（原先仅 CmdK 可搜）。


### M87 — Alert rules visible in menus (0.5.1)
- Tools 菜单显示 **告警规则…**（原先仅 CmdK 可搜）。


### M86 — Run playbook visible in menus (0.5.0)
- Tools 菜单显示 **运行剧本…**（原先仅 CmdK 可搜；handler 已有）。版本号升至 0.5.0。


### M85 — Import playbook pack CmdK (0.4.99)
- Tools/CmdK **导入剧本分享包…**（打开导入页；handler 已有）。


### M84 — Export playbook pack CmdK (0.4.98)
- Tools/CmdK **导出剧本分享包…**（打开剧本列表并触发导出；handler 已有）。


### M83 — Refresh home health need-home toast (0.4.97)
- 刷新运维首页健康在未打开首页时 toast 提示，不再静默返回。


### M82 — Retry failed probes toasts (0.4.96)
- 重试失败采样在未打开运维首页或无失败项时给出 toast，不再静默返回。


### M81 — Alert need-context toasts are action-specific (0.4.95)
- AI 复盘 / 导出复盘在缺告警或未打开工作台时给出对应提示。


### M80 — Diff fix playbook CmdK (0.4.94)
- AI/CmdK **差异生成修复剧本…**（需打开 file-diff；handler 已有）。


### M79 — Diff need-tab toast is action-specific (0.4.93)
- 解释差异 / 生成修复剧本在无差异标签时给出对应提示文案。


### M78 — Explain file diff CmdK (0.4.92)
- AI/CmdK **解释文件差异…**（需打开 file-diff 标签；handler 已有）。


### M77 — Split-off toast mentions broadcast (0.4.91)
- 状态栏退出分屏时若同时关闭广播，toast 明确说明「已退出分屏并关闭广播」。


### M76 — Production guard CmdK (0.4.90)
- Session/CmdK **生产防护…**（打开主机档案生产防护；handler 已有）。


### M75 — Export postmortem CmdK (0.4.89)
- Tools/CmdK **导出复盘…**（告警工作台导出复盘；handler 已有）。


### M74 — AI alert postmortem CmdK (0.4.88)
- AI/CmdK **AI 复盘告警…**（对当前/活动告警做 AI 复盘；handler 已有）。


### M73 — Dry-run reminder CmdK (0.4.87)
- Tools/CmdK **演练提醒筛选…**（打开剧本列表并套用提醒筛选；handler 已有）。


### M72 — Latency copy toast shows host (0.4.86)
- 状态栏延迟芯片点击复制时 toast 带上主机名。


### M71 — Reconnect-all done toast lists hosts (0.4.85)
- 重连全部已断开会话结束 toast（成功/失败）列出主机名。


### M70 — Sync preview CmdK (0.4.84)
- Session/CmdK **同步预览…**（打开同步预览/设置；handler 已有）。


### M69 — Status-bar unpin toast shows host (0.4.83)
- 状态栏固定芯片取消固定时 toast 显示主机/标签名。


### M68 — Sync conflicts CmdK (0.4.82)
- Session/CmdK **同步冲突…**（打开冲突列表；handler 已有）。


### M67 — Reconnect-all started toast with hosts (0.4.81)
- 重连全部已断开会话开始时 toast 列出主机名与数量。


### M66 — Export-tabs toast lists titles (0.4.80)
- 导出打开标签到剪贴板成功 toast 列出标签标题（多时截断）。


### M65 — Test jump path CmdK (0.4.79)
- Session/CmdK **测试跳板…**（探测跳板路径；handler 已有）。


### M64 — Save-workspace toast lists tabs (0.4.78)
- 手动保存工作区 toast 列出标签标题（多时截断）。


### M63 — AI menu explain last error (0.4.77)
- AI ⋯ 菜单增加 **AI 解释报错**（最近终端错误；CmdK 已有）。


### M62 — Close-disconnected toast lists hosts (0.4.76)
- 关闭已断开标签 toast 列出主机名（多时截断）。


### M61 — Jump hosts CmdK (0.4.75)
- Session/CmdK **跳板主机…**（打开连接编辑器跳板区；handler 已有）。


### M60 — Disconnect-all toast lists hosts (0.4.74)
- 断开全部会话成功 toast 列出主机名（与确认框一致）。


### M59 — Disconnect toast shows host (0.4.73)
- 断开当前会话成功 toast 带上主机名，与确认框/重连提示一致。


### M58 — Check certificates CmdK (0.4.72)
- Session/CmdK **检查证书…**（打开连接编辑器证书区；handler 已有）。


### M57 — SFTP filter empty state (0.4.71)
- 文件名筛选无结果时显示「无匹配文件」空状态（含筛选词），不再误显示「目录为空」。


### M56 — Reconnect started toast with host (0.4.70)
- CmdK/菜单 **立即重连** 时 toast 显示主机名，确认正在重连哪台。


### M55 — Disconnect-all confirm lists hosts (0.4.69)
- 断开全部会话确认框正文列出主机名（多时截断），与单会话确认一致。


### M54 — Disconnect confirm shows host (0.4.68)
- 断开当前会话确认框正文带上 **主机名/标签**，避免误断错会话。


### M53 — Empty-state AI shortcut tip (0.4.67)
- 空终端状态增加 **Ctrl+Shift+A**「打开 AI」快捷键提示（与聚焦终端提示并列）。


### M52 — Explain selection in AI menu (0.4.66)
- AI ⋯ 菜单与 CmdK **解释选中内容**（终端选区 → AI；handler 已有）。


### M51 — Maintenance window CmdK (0.4.65)
- Tools/CmdK **维护窗口…**（打开维护窗口；handler 已有）。


### M50 — File snapshots CmdK (0.4.64)
- Session/CmdK **文件历史快照…**（远端文件本地快照；编辑器内仍可用 Ctrl+H）。


### M49 — Gate timeline CmdK (0.4.63)
- Ops/CmdK **闸门时间线**（只读阻止 / 生产确认记录）。


### M48 — Open Docker CmdK (0.4.62)
- Ops/CmdK **Docker 容器…**（打开当前会话 Docker；无会话时弹出主机选择）。


### M47 — SFTP clear name filter (0.4.61)
- SFTP name filter shows a **clear** control when the query is non-empty.


### M46 — SFTP sort mode (0.4.60)
- SFTP lists: toggle sort **by name / modified time** (dirs first).


### M45 — AI focus shortcut hint (0.4.59)
- AI panel header shows **Ctrl+Shift+A** tip for focusing the AI panel.


### M44 — SFTP name filter (0.4.58)
- SFTP panes: filter files by name (`sftpNameFilterMatch` + search input).


### M43 — Status-bar SFTP comfort (0.4.57)
- When SFTP comfort density is on, status bar shows **SFTP 舒适**; click restores auto density.


### M42 — Status-bar split chip (0.4.56)
- When split view is on, status bar shows **分屏中**; click exits split.


### M41 — Status-bar host double-click focus (0.4.55)
- Host status chip: **double-click** focuses the active terminal (`aiss-focus-terminal`).


### M40 — Status-bar session note (0.4.54)
- When the active profile has a note, status bar shows a preview chip; click edits the note.


### M39 — AI copy-last in ⋯ menu (0.4.53)
- AI panel more menu: **复制上一条回复** (`ai-copy-last-reply`).


### M38 — Status-bar pin chip (0.4.52)
- When the active tab is pinned, status bar shows **已固定**; click unpins.


### M37 — Status-bar host copy (0.4.51)
- Active SSH session shows a host chip in the status bar; click copies the connection string.


### M36 — Reconnect now CmdK (0.4.50)
- Session/CmdK **立即重连（已断开）**（原仅有 handler）。


### M35 — Empty-state focus terminal hint (0.4.49)
- Terminal empty state shows **Ctrl+Shift+`** tip for focusing the terminal.


### M34 — Built-in playbooks CmdK (0.4.48)
- Ops/CmdK **内置运维剧本…**（打开剧本列表并派发 `aiss-builtin-playbooks`）。


### M33 — Built-in snippets CmdK (0.4.47)
- Ops/CmdK **内置命令片段…**（打开片段面板并预览内置库）。


### M32 — Status-bar mute-bell chip (0.4.46)
- When terminal bell is muted, status bar shows **铃已静音**; click restores sound/flash.


### M31 — Reconnect policy CmdK (0.4.45)
- Session/CmdK **重连策略…**（原仅有 handler，现可发现）。


### M30 — Disconnect reason on empty card (0.4.44)
- Disconnected terminal card shows friendly `failRaw` and **复制原因**.


### M29 — Status-bar latency copy (0.4.43)
- Status-bar RTT chip is clickable: copies plain `{n} ms` (`latencyClipboardText`).


### M28 — Clear scrollback shortcut (0.4.42)
- **Ctrl+Shift+K** clears terminal scrollback (`clearScrollback` in keymap).


### M27 — Focus terminal shortcut (0.4.41)
- **Ctrl+Shift+`** focuses the terminal (`focusTerminal` in keymap; Backquote-aware).


### M26 — Focus terminal CmdK (0.4.40)
- View/CmdK **聚焦终端**：确保主区可见并 `aiss-focus-terminal` 聚焦活动会话。


### M25 — Close disconnected tabs CmdK (0.4.39)
- View/CmdK **关闭已断开的标签**（与标签列表同逻辑，可撤销）。


### M24 — Export open tabs list (0.4.38)
- File/CmdK **复制打开的标签列表**：名称 + 主机写入剪贴板（`formatOpenTabsList`）。


### M23 — Save workspace now (0.4.37)
- File/CmdK **立即保存工作区**：手动写入上次布局快照（`saveLastWorkspace` / `snapshotWorkspace`）。


### M22 — Disconnect all sessions (0.4.36)
- Session/CmdK **断开全部会话…**：确认后断开所有已连接 SSH，保留标签并抑制自动重连。


### M21 — Disconnect session confirm (0.4.35)
- Session/CmdK **断开当前会话…**：确认后断开 SSH，保留标签以便重连。


### M20 — SFTP transfer queue CmdK (0.4.34)
- CmdK/菜单 **SFTP 传输队列**：打开当前 SSH 的 SFTP 并聚焦传输队列（`aiss-sftp-focus-queue`）。


### M19 — AI sparkle shortcut tip (0.4.33)
- Layout AI sparkle button tooltip/aria shows **Ctrl+Shift+A** (`keysFor('focusAiPanel')`).


### M18 — Focus AI shortcut (0.4.32)
- **Ctrl+Shift+A** focuses the AI panel (`focusAiPanel` in keymap; toggle remains Ctrl+Alt+B).


### M17 — Copy last AI reply (0.4.31)
- View/CmdK **复制上一条 AI 回复** (`copyLastAiReply` → clipboard via `lastAssistantText`).


### M16 — Status-bar SSH latency (0.4.30)
- Active SSH session RTT chip in the status bar (`workspace.ping` / `formatStatusLatency`).


### M15 — Mute terminal bell (0.4.29)
- Prefs + View/CmdK **静音终端铃** (`muteBell`; xterm `onBell` flash when unmuted).


### M14 — Clear terminal scrollback (0.4.28)
- View/CmdK **清空终端回滚缓冲** (`clearScrollback`) → `term.clear()` on the active session.


### M13 — SFTP go to path (0.4.27)
- SFTP path field **Go** button + paste/trim normalization (`normalizeGotoPath`) for local/remote jump.


### M12 — CmdK recent/saved hosts (0.4.26)
- Ctrl+K lists **recent + saved hosts** for one-click open (`sessionProfileId` → `connectProfile`).


### M11 — SFTP copy path (0.4.25)
- SFTP breadcrumb bar **Copy path** for local/remote cwd (clipboard + toast).


### M10 — Clear AI chat via CmdK (0.4.24)
- **CmdK / View: Clear AI chat…** focuses the AI pane and runs the existing confirm + clear conversation flow.


### M9 — Reopen closed tab (0.4.23)
- **CmdK / Ctrl+Shift+T: Reopen closed tab** — restores last closed SSH/session tab from a short stack.


### M8 — All tabs dropdown (0.4.22)
- Tab strip **全部标签** always available (not only when overflowing); search/jump/close reuse overflow menu; CmdK `openAllTabs`.


### M7 — Close tabs to the right via CmdK (0.4.21)
- **CmdK / View: Close tabs to the right** (`closeTabsToRight`) — same rules as tab menu (keeps pinned/home).


### M6 — Close other tabs via CmdK (0.4.20)
- **CmdK / View: Close other tabs** (`closeOtherTabs`) — same keep rules as tab menu (current + pinned + home).


### M5 — Middle-click close tab (0.4.19)
- Middle-click a tab to close it (sidebar toggle already existed).


### M4 — Focus AI panel (0.4.18)
- **CmdK / View: Focus AI panel** (`focusAiPanel`) — opens/shows AI pane (duplicate session already existed).


### M3 — Status bar font zoom out (0.4.17)
- Status bar font chip: **Ctrl/Alt+click** zooms out one step (mirrors Shift+click zoom in).


### M2 — Status bar font chip (0.4.16)
- Status bar font size: click still resets; **Shift+click** increases (`bumpTerminalFontSize`).


### M68 — Copy connection string (0.4.15)
- **CmdK / Session: Copy connection string** (`user@host:port` to clipboard + toast `sess.copiedConn`).


- **CmdK / Session: Copy connection string** (`user@host:port` to clipboard + toast).

- **CmdK / Session: Edit session note…** (`editSessionNote`) opens the connection editor focused on the note field for the active saved host (tab rename already existed).

- **Status bar** shows current terminal font size (`terminalPrefs.fontSize`); click resets to default.

- **AI panel toggle** uses `assets/ai-sparkle.png` on the titlebar layout control.

- **CmdK / View: pin/unpin current tab** (`toggleTabPin`) — same toggle as tab pin button / context menu.

### SFTP transfer queue UX (local)
- Clearer per-task progress (bytes / total · % · speed · ETA) with `role="progressbar"`.
- **Clear finished** removes done/cancelled rows; empty-state copy when the queue is open and idle.
- Status **grouping** (active / paused·interrupted / failed / finished); pause bar tone; cancel/pause/resume testids.
- Shared helpers in `sftp-queue.ts`; test `scripts/test-sftp-queue-ux.ts`.

### Terminal font zoom + session notes (local)
- **Terminal font zoom**: `Ctrl+=` / `Ctrl+-` / `Ctrl+0` (and View menu) bump/reset `terminalPrefs.fontSize` (10–32, default 14); preference persists via existing prefs store; toast shows current size.
- **Session notes**: optional short `note` on saved session profiles (connection form field, max 120 chars); shown as sidebar subtitle + hover title; included in session search filter.
- Tests: `scripts/test-terminal-zoom.ts`, `scripts/test-session-note.ts` (wired into `npm test`).


Draft notes for a future GitHub Release / What’s new. **Not published.** Package stays `0.4.14`. No tag, no Release, no website.


## AI provider & tab pin (2026-10-16)
- **Test connection** — AI settings form button (`ai-provider-test`) sends a minimal non-streaming `chat/completions` with the **current form** Base URL / API Key / model (Save not required); friendly errors reuse `ai-http-error`; 12s timeout.
- **Pin discoverability** — hover pin control on tabs (`tab-pin-btn`), tooltip tip, first-pin toast; right-click Pin unchanged.



## Visual coverage & overlays
- Screenshot dismiss also clears toasts and mutes alerts briefly so coverage shots stay unoccluded.
- **SFTP screenshot dual-pane mock** — sftpDual / sftpMockFill hooks fill fake local + remote rows (DEMO_TREE + sample project) without a live SSH session; cov-sftp-dual.png in coverage script. Demo SFTP proxy gains opendir/close for ssh2-compatible browse.
- **Product overlays park under chrome** — welcome / tour / quick-start suppress while CmdK, shortcuts, known-hosts, or connection editor is open; tour root z-index lowered so it no longer stacks above the palette.
- **Modal `data-testid`** — non-embedded Modal panels/backdrops expose test ids (known-hosts alone shots).
- **Screenshot hooks** (`aiss.screenshot.hooks=1`) — dismissProduct (incl. first-week tips), closeModals (no Esc, so AI pending is not declined), knownHosts, sftp (refocus SFTP tab), theme, aiConfirm (forces chat UI + pending dock even without a real API key).
- **Coverage script** `scripts/screenshot-visual-coverage.mjs` — dark main, known-hosts, SFTP tab, AI pending dock, light theme, light known-hosts; copies to `%TEMP%\aiss-screenshots\`.


## OpenSSH & host trust
- **Config Include expand** — recursive `Include` (max depth 3, ≤32 files), cycle-safe, allowlisted to `~/.ssh` + entry dir; skipped paths surface in import preview notes.
- **Hashed known_hosts lookup** — optional `ssh-keygen -F <host>` for a host the user explicitly names (Known Hosts UI + connect host-key dialog fingerprint check). Bulk import still never unhashes the whole file.
- OpenSSH session import hardened earlier in the day (Host/HostName/User/Port/IdentityFile/ProxyJump/LocalForward, preview N2).


## Host trust lookup cache
- **ssh-keygen -F short-lived cache** (60s TTL, same host+file) with mtime check; cleared on known_hosts import/remove IPC.

## README vs UI gap polish
- **Certificate auth UX** — Browse… for OpenSSH certificate path (sibling `*-cert.pub` still auto-tried when empty).
- **Local shell UX** — menu/CmdK disabled when `node-pty` missing; bilingual labels/errors.
- **Keep-alive discoverability** — default TCP keep-alive **60s** for new installs; visible nudge when turned off (Settings → Connections).

## Inventory & MCP
- **Sync-free inventory JSON export/import** in the app (strips `privateKeyPath`).
- MCP CLI `--export` / `--import` and tools `export_inventory` / `import_inventory`; empty `--list` hint; guide + README.

## Themes & terminal
- UI light/dark toggle (Ctrl+Alt+D) end-to-end; pairs a matching terminal theme (light UI → github-light / sand → solarized-light).
- Terminal themes **github-light** / **solarized-light**; picker labels i18n.
- **OSC 52** remote→local clipboard write (default on; queries refused); Terminal prefs toggle.

## Snippets
- Ctrl+K lists user + built-in snippets and inserts into the active terminal.
- **Per-snippet hotkeys** (Ctrl+Alt / Ctrl+Shift chords); conflict checks vs app keymap and peers; suggest free keys; list/CmdK badges.
- Empty-state / footer discoverability hints.

## Bugfixes (same day)
- Snippet hotkeys ignored while focus is in form fields.
- AI confirm Esc no longer steals Esc from the composer; dock focus restore after agree/decline; chip focus respects composer.
- Snippet import normalizes/rejects invalid hotkeys.


## Tabs, proxy & broadcast
- **Tab drag-reorder persist** — workspace snapshot saves strip order (pinned first + openSeq) and restores pinned / openSeq.
- **ProxyCommand discoverability** — OpenSSH import records ProxyCommand on drafts and surfaces a note (not applied at connect); connection Advanced shows ProxyJump hint.
- **Broadcast input** — mount the missing target picker (opt-in); badge/statusbar reopen picker; Stop in dialog; lead copy.


## Broadcast remember & serial note
- **Broadcast targets persist** across picker reopen / stop (session memory); pruned when those sessions disconnect or tabs close; auto-off when fewer than two remain.
- **Serial ports** — documented as unsupported (README EN/ZH); File menu + Ctrl+K entry with toast and optional Local shell action.


## Product overlay vs CmdK
- **Park quick start / welcome / G2 tour** while CmdK, shortcuts, known-hosts, or a connection/import editor is open; they resume when chrome closes.
- **Tour z-index** lowered below CmdK (90 vs 1500) so the guide cannot poke through the palette.

## Verify (local)
- `npm run typecheck`
- Relevant scripts: `test-ssh-config-import`, `test-inventory-export`, `test-mcp-inventory-export`, `test-theme-toggle`, `test-osc52`, `test-cmdk-snippets`, `test-snippet-hotkey`, `test-known-hosts-io` (incl. F-cache + cert/local/KA wiring), `test-l9-s4`, `test-bugfix-hotkey-ai`

## Still HOLD / out of scope
- Website / GitHub Release
- Manual 1366 visual QA (unless asked)
