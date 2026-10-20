# D99 Ctrl+滚轮缩放终端字体

- 核对：已有 Ctrl+= / Ctrl+- / Ctrl+0 缩放（keymap 的 zoomIn、zoomOut、zoomReset），但终端里没有处理 wheel 事件。所以 Ctrl+滚轮缩放是真实缺口，Windows Terminal、VS Code 等都把它当成常规操作。
- 方案：
  - TerminalPane 在捕获阶段监听 wheel：只有单独按住 Ctrl 时才拦截，阻止页面整体缩放和 xterm 滚动。
  - shared/wheel-zoom 把触控板的小增量累加起来，凑满 50 才算一档。
  - 每一档派发 aiss-term-zoom 事件，由 App 交给现有的 zoomIn / zoomOut 处理，上下限、提示和持久化都和快捷键一致。
  - 不带 Ctrl 的滚轮照常滚动。快捷键说明里的标签补上「也可 Ctrl+滚轮」。
