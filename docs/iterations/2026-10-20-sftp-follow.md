# D12 SFTP 远程面板跟随终端目录

**PM**：在终端 cd 到目录后打开/切到 SFTP，期望远程面板就在那里，并随后续 cd 同步。

**现状核查（发现缺陷）**：「会话目录」按钮和"打开时对齐目录"都用 `ssh.exec('pwd')`——exec 是独立通道，返回的永远是 $HOME，不是交互 shell 的当前目录。D2 已在渲染端跟踪每会话 cwd（OSC 7 / 提示符），但 SFTP 没用。

**交互/UI**
- 远程面板头部新增「跟随终端」勾选，默认开（只存关闭）。开启时终端每次 cwd 变化，远程面板切到该目录；手动浏览不受影响，直到下一次 cd。
- 「会话目录」按钮和打开对齐优先使用跟踪到的 cwd；`~` 路径用 SFTP home 解析；拿不到才回退到 exec pwd / home。

**开发**：`shared/sftp-follow.ts`（sftpFollowEnabled / followTarget），`session-cwd-store` 变化时派发 `aiss-session-cwd`，SftpPanel 订阅（序号防乱序）。

**限制**：依赖 D2 的 cwd 跟踪（提示符可解析或 OSC 7）；`sudo -i`/嵌套 ssh 后跟踪到的目录可能属于另一环境，面板会提示列目录失败。

**测试**：test-cycle7 D12 ×2；截图 `sftp-follow.png`。
