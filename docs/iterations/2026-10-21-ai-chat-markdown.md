# D86 复制整段 AI 对话为 Markdown

- 需求：排障结束后要把过程贴进工单或文档，现在只能「复制最后一条回复」，或者一条一条复制。AI 对话高频使用。
- 去重：grep docs/iterations 与 src（markdown / exportChat / copyAll），只有 ai-copy-last-reply（只复制最后一条回复）。
- 方案：
  - shared/ai-chat-markdown.ts（chatToMarkdown）：每条提问和回复各成一节；command 类步骤单独附 bash 代码块，并标注风险等级与是否已同意。
  - 跳过生成中的内容和错误卡片；整段经过 redactAuditText 脱敏。
  - 入口在 AI 面板「更多」菜单（ai-copy-chat-md），只复制到剪贴板。
