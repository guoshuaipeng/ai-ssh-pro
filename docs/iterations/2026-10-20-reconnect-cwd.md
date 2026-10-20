# D2 断线重连后回到原工作目录 · P0（高频）

## 需求
- 现状：自动重连（按退避重试、显示倒计时、可取消）早已有了，但重连后 shell 会回到家目录，用户每次都要手动 `cd` 回去。
- 用户故事：笔记本休眠醒来，会话自动重连后，我还在 `/etc/nginx`。
- 验收：
  1. 会话期间记录 cwd：优先使用 OSC 7（`file://host/path`）；没有的话，从常见的 bash 提示符 `user@host:/path$` 里解析。
  2. RHEL 风格的提示符 `[u@h dir]$` 只显示目录名，不能确定完整路径，所以不采信。
  3. 重连成功后写入一行 ` cd -- '<path>'`：前导空格配合 HISTCONTROL 可以不进历史；路径用单引号转义；`~/x` 写成 `~/'x'`。
  4. 拒绝控制字符、相对路径和超过 1024 字符的路径。家目录不需要 cd。
  5. toast 提示“已回到工作目录 {path} / Back in {path}”。
  6. 只读或生产主机同样会恢复：cd 只是切换目录，不会重放用户的任何命令。
  7. 本地 shell 不做恢复。

## 交互 / UI
- 不新增控件，只有一条 toast。没有加载态。
- 写入 cd 的时机是新会话建立后 400ms（shell 会先缓冲输入），会话断开时写入失败直接忽略。

## 已知限制
- 自定义 PS1、zsh、fish 的提示符不解析，除非 shell 自己会发 OSC 7（fish 和许多发行版的 zsh 默认会发）。
- cd 这一行在终端里可见。

## 实现与测试
- `shared/session-cwd.ts`、`lib/session-cwd-store.ts`，TerminalPane 中注册 OSC 7 处理并在光标移动时解析，App 的 `reconnectTab` 里恢复。
- 测试：`scripts/test-cycle4.ts`。
