# D77 连接超时可调 + 等待计时

- 需求：慢网/跨境主机 20s 固定握手超时会误判失败；连接中横幅没有任何进度感。
- 现状核查：ssh-manager.ts 跳板与目标均硬编码 `readyTimeout: 20000`；横幅仅显示“正在连接 target”。
- 方案：
  - shared/connect-timeout.ts：clampConnectTimeoutSec（5–120，默认 20）、readyTimeoutMs、elapsedSec。
  - ReconnectPolicy 新增 connectTimeoutSec（全局，设置 → 重连，主题 Select：10/20/30/60/120）。
  - SshConnectOptions.readyTimeoutSec；新开与重连都传入；主进程跳板与目标共用。
  - 横幅新增 ConnectingElapsed：“已等待 Ns / 超时 Ms”，每秒刷新。
- 取舍：先做全局而非按主机（改动小、覆盖主路径）；DNS/TCP/认证分阶段事件需主进程事件，推迟。
