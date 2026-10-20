# D14b 主进程感知 Shell Integration

**PM**：开启 D14 后，AI 代理（主进程写入）的命令仍带 printf 后缀并回显。

**现状核查**：主进程 ExitCaptureRegistry 只认 printf 的 OSC 777 标记；渲染端知道 133 激活但没告诉主进程。

**方案**
- 渲染端第一次在会话里看到 OSC 133 → IPC `ssh:setShellIntegration(sessionId, true)`。
- 主进程激活后：AI 命令原样写入（无后缀），nonce 进入队列；输出流里的 `OSC 133;D;<code>`（可跨 chunk）按顺序出队并解析等待者；标记保留在流中（渲染端还要用）。没有排队命令的提示符（注入后、用户直接敲的命令）忽略。
- 关闭（setIntegrated false）或从未激活：照旧用 printf 标记。演示会话不处理。

**验证**：box 上 zsh 5.9（apt download 解包，`zsh -f -i`）和 bash 5.2 交互 shell 实测注入脚本：重复注入只挂一个钩子（zsh `precmd_functions` 只有 `__aiss_si`），`false` → 133;D;1，`sh -c "exit 7"` → 133;D;7，cd 后 OSC 7 正确。主进程解析由 test-cycle9 ×4 覆盖。

**限制**：AI 命令排队时若用户同时在终端里敲命令，退出码可能对错位（按提示符顺序匹配）；oh-my-zsh 等主题未测。
