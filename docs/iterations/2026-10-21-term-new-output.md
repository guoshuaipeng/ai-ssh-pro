# D82 终端“有新输出”提示

- 需求：tail -f、构建、日志滚动时，用户上翻查看历史，新输出到来却不知道；要手动滚回底部。终端是最高频路径。
- 核查：TerminalPane 仅在块导航 next 时 scrollToBottom；无滚动状态提示。docs/iterations 无相关条目（block-nav 为命令块跳转）。
- 方案：onWriteParsed 时若视口不在底部 → 右下角显示“↓ 有新输出”（data-testid term-new-below）；onScroll 回到底部即隐藏；点击 scrollToBottom 并聚焦。用 ref 去重避免每次写入都重渲染。全屏程序（备用缓冲区 baseY=0）不触发。
