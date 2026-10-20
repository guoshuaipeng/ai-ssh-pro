# D14 Shell Integration（可选，bash/zsh）

**PM**：D2/D8/D10/D11/D12 都靠解析提示符；直接键入的命令没有退出码，命令栏的 printf 后缀会回显。

**现状核查**：已处理 OSC 7（D2）；没有 OSC 133；B1/D11 退出码只能靠 printf 后缀。

**方案**
- 默认关。菜单「会话 → Shell 集成（bash/zsh）」或分块条头部勾选开启。
- 开启后，在会话首次输出 1.5 秒后（或开启时对已打开的会话），**仅当光标停在空提示符后**，写入一行（前导空格，HISTCONTROL=ignorespace 时不进历史）：定义 `__aiss_si`，bash 前置到 PROMPT_COMMAND，zsh 用 add-zsh-hook precmd；每次出提示符前打印 `OSC 133;D;$?` 和 `OSC 7`。重复执行不叠加。不改服务器文件，断开即失效。
- 渲染端 `registerOscHandler(133)`：D;code 结束当前运行中的块 → 直接键入的命令也有退出码；收到任何 133 标记即视为"已激活"，此后命令栏 / AI 面板发出的命令不再追加 printf（无回显后缀）。
- 回退：5 秒内没收到 133（fish、sh、busybox、网络设备、`sudo -i` 后的新 shell 等）→ 提示"仅支持 bash/zsh，已回退为 printf 标记"，行为与之前一致。
- 不注入：只读会话、镜像分屏、备用屏（vim 等）、演示主机、提示符后已有输入。

**验证**：box 上真实 bash 5.2 交互 shell：两次注入后 PROMPT_COMMAND 只有一个 `__aiss_si`；`false` → 133;D;1，`sh -c "exit 7"` → 133;D;7，`cd /etc` 后 OSC 7 为 /etc。zsh 未在本机实测（环境里没有 zsh）。

**限制**：注入那一行会在终端回显一次；B1 的 AI 代理命令（主进程写入）仍带 printf 后缀，下一步可让主进程也感知激活状态。

**测试**：test-cycle8 D14 ×5；截图 `shell-int.png`。
