# D77b 连接阶段显示 + 超时标明卡点

- 需求：D77 只有计时；用户不知道是 DNS/网络不通、握手慢还是认证卡住。
- 核查：主进程只有 `ssh:hop`（跳板序号），无阶段事件；超时错误只有 ssh2 原文 "Timed out while waiting for handshake"。
- 方案：
  - shared/connect-stage.ts：ConnectStage（tcp/handshake/auth/shell）、stageTarget、stageTimeoutSuffix。
  - ssh-manager connectClient 增加 onStage：开始=tcp（含 DNS），socket `connect`=handshake，`handshake`=auth，ready 后发 shell。跳板带 hop/hopTotal。
  - 新 IPC `ssh:stage`（以目标 host:port 为键）；横幅显示“SSH 握手中 / 跳板 1/2 · 认证中”。
  - 超时类错误追加“（卡在：认证）”，直接出现在失败卡片里。
- 取舍：DNS 与 TCP 合并为一个阶段（ssh2 不分别暴露）；同一目标并发连接共用一个阶段显示。
