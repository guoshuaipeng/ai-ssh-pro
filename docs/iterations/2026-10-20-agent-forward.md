# C3 SSH Agent 转发（按主机开关）· P1

## 需求
- 问题：在跳板机上 `git pull`，或者再 ssh 到下一台机器时，需要用到本机的密钥，又不想把私钥拷到服务器上。
- 用户故事：作为开发者，我想只对信任的主机打开 agent 转发。
- 验收：
  - 连接配置里增加“转发 SSH Agent”复选框，默认关闭。
  - 只在目标连接上开启，跳板节点不开启。
  - 对只读或生产主机开启时需要二次确认。
  - 切换开关时写审计 `agentForward.change`，每次带转发连接成功时写审计 `session.agentForward`。
  - 本机没有可用的 agent 时连接失败，并给出明确提示，而不是静默忽略。

## 交互 / UI
- 提示文案：“服务器上的 root 可借用你的密钥，只对信任的主机开启”。开关打开后，这条提示变为 `--color-warn` 色。
- 确认框：
  - 标题：“对受保护主机开启 Agent 转发？”
  - 正文按只读或生产两种情况区分。
  - 确认按钮：“仍然开启”。
- 只读主机上这个开关仍然可以操作，因为开启前有确认，不需要禁用。

## 实现
- `src/shared/agent-forward.ts`
- `ssh-auth.ts` 中的 `applyAgentForward`
- 测试：`scripts/test-agent-forward.ts`
