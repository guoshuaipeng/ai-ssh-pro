# D94 AI 输入框粘贴长日志时折叠为块

- 需求：排障时常把几百行日志粘进 AI 输入框，输入框被撑满，提问被淹没，而且日志可能带着令牌或密码。AI 对话高频。
- 去重：grep docs/iterations 与 src 中的 onPaste / pasteCollapse，没有现成实现。D39 是 SFTP 文件附带，D66 是终端选区，都不处理粘贴。
- 方案：
  - shared/paste-block.ts：shouldCollapsePaste（≥12 行或 ≥1500 字）、buildPasteBlock、composeWithBlocks。
  - buildPasteBlock 先 redactAuditText 脱敏，再 fenceSelection（复用 D66 的 trimLog，上限 8000 字）。
  - textarea onPaste 时，长内容不进输入框，改为输入框上方的折叠块（ai-paste-block）：显示「粘贴的内容 · N 行」、是否已脱敏和前 3 行；可以展开查看实际会发送的内容。点 × 移除时会先确认。
  - 发送时内容为「手打的问题 + 各个块」；只有块、没有手打问题也可以发送。仍需用户自己按发送。
- 短粘贴不受影响。
