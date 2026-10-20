# D34 命令栏联想：Ctrl+Enter 发送 +「在原目录」（2026-10-20，第 19 轮）

## 需求
D31/D33 只在 Ctrl+R 生效；命令栏联想是另一条高频入口，补齐同样能力。

## 设计
- ↑↓ 高亮一条联想后按 Ctrl+Enter（⌘+Enter）：直接把该条作为命令发送。走命令栏原有 submit → onSubmit 路径，危险命令确认、生产主机 beforeSend、只读闸门全部照旧生效（不像 Ctrl+R 那样需要另做风险判断）。未高亮时 Ctrl+Enter 等同 Enter。
- 联想行显示上次目录；与当前会话目录不同时出现"在原目录"，点击把 `cd -- '<dir>' && <cmd>` 填入命令栏（不发送）。
- 当前目录由 SessionCommandBar 传入（getSessionCwd）。
