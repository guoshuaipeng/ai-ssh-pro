# D95 自定义常用提问

- 需求：空对话时的起步提问（ux64，三条）是固定的；用户常用的问题（如「看下 nginx 错误日志」）每次都要重新输入。AI 对话高频。
- 去重：grep docs/iterations 与 src 中的 starterPrompts / customPrompt，只找到写死的 ux64 三条。
- 方案：
  - shared/ai-prompts.ts：本机存储（aiss.ai.prompts.v1），最多 8 条，每条 200 字，去重并压缩空白。
  - 空对话状态在内置三条之后显示用户提问（ai-my-prompt）；点击只填入输入框，不发送。
  - 输入框有内容时，显示「+ 把当前输入存为常用提问」。
  - 每条带 ×，删除前用 confirmDialog 确认。
- 限制：只在空对话时显示（与内置起步提问在同一位置）；不同步到云端。
