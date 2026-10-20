# D78 终端选中后浮动“问 AI”

- 需求：问 AI 是高频动作，但目前只能右键 → 问 AI（D6/D46），鼠标选中后多一步。
- 核查：TerminalPane 无选区浮层；右键菜单 aiAskCtx 已有，D66 在 App 侧做裁剪 + 脱敏。
- 方案：鼠标松开且有非空选区时，在指针旁显示小按钮“问 AI”（data-testid term-sel-ask）；
  点击复用 requestAskWithContext(selectionWithLastRun)，仅预填输入框，用户自己发送；
  选区清空即隐藏；onMouseDown preventDefault 保留选区；镜像只读窗格不显示。
- 限制：键盘选区（Shift+方向）不触发浮层，仍可用右键菜单。
