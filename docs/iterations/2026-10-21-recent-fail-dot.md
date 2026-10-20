# D88 最近连接标记上次失败

- 需求：连接失败后，侧栏「最近连接」里看不出哪台主机上次失败、因为什么失败；只有失败卡片关闭前才看得到原因。连接每天都要用。
- 去重：grep docs/iterations 与 src（lastFail / failedAt / RecentConnection 字段），无相关实现；RecentConnection 只在连接成功时写入。
- 方案：lib/connect-fail-store.ts，按 `user@host:port` 只在内存中记录最近一次失败（不落盘，重启即清空，成功连接时清除）。openTab 的 catch 记录 friendlyErrorMessage，成功时清除。RecentConnections 在名称前显示小红点（recent-fail-dot），悬停显示失败原因；点击行为不变（仍直接连接）。
- 限制：从未成功连接过的主机不在「最近连接」里，所以不显示红点（失败卡片已覆盖这种情况）。
