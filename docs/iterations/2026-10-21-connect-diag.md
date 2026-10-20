# D83 连接失败卡片「复制诊断信息」

- 需求：连接失败后，用户经常要把情况发给同事或问 AI，现在只能截图，或者展开「技术细节」手动复制。连接每天都要用。
- 去重：grep docs/iterations 和 src 中的「诊断 / diagnostic」，没有失败卡片相关的条目。D49 的 tab-copy-info 只复制会话信息，不含失败上下文。
- 方案：
  - 新增 shared/connect-diag.ts（buildConnectDiag）。
  - 失败时记录最近一次尝试：连接参数、开始和结束时间，以及 D77b 的最后阶段。
  - ConnectTrouble 加一个次要按钮「复制诊断信息」（connect-copy-diag），复制以下内容：时间、目标、认证方式、跳板机数量、失败类型、最后阶段、耗时、握手超时、keep-alive、应用版本，以及经过 redactAuditText 脱敏的错误原文。
  - 不含密码、私钥口令或私钥内容。只复制到剪贴板，不会自动发给 AI。
