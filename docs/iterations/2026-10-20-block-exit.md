# D11 命令块退出码 + 一键问 AI 为何失败

**PM**：命令块（D10）只有输出没有成败；运维最常问的是"这条为什么失败"。在块上显示退出码，失败块一键把命令+输出尾部+问题带进 AI 输入框。

**现状核查**：B1 只给 AI 代理（主进程）写入的命令加 OSC 777 标记，主进程剥离后渲染端拿不到退出码；`TermBlock.exitCode` 字段存在但从未赋值。

**交互/UI**
- 块标题栏：运行中 `…`；成功 `✓`（绿）；失败 `✗ N`（红框）；无码 `—`，tooltip 说明"直接在终端输入的命令没有退出码标记"。
- 失败块多一个红色按钮「问 AI 为何失败」→ 切到该标签的 AI 会话，输入框预填 主机/目录 + 代码块(`$ cmd` + 输出尾 4000 字) + 问题；不自动发送。
- 块条头部「退出码」勾选，可关闭。

**默认开启评估**：命令块本身需手动开启，开启者要的就是结构化结果，所以退出码默认开（只存关闭状态）。代价：命令栏/AI 面板发出的命令回显里多一段 printf 后缀（与 B1 同一限制，见 exit-echo.md）；块输出里已用 `stripEchoedMarker` 去掉。直接在终端敲的命令不改写，不显示退出码——改写用户键入的行风险太大。

**开发**：`shared/block-exit.ts`（blockWire / createBlockExitParser / applyExitHits / blockFailed / failedBlockContext），`lib/block-wire.ts`，命令栏与 ai-run 写入走 `commandWire`；渲染端从原始字节流解析标记（xterm 本就忽略未知 OSC）。

**测试**：test-cycle7 D11 ×5；截图 `iteration-2026-10-20-c7/blocks-exit.png`。
