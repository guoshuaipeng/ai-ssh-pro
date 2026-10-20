# D1 终端内查找增强（高频）· P0

## 需求
- 问题：在终端里找错误、PID 或 IP 是每天都在做的事。现在的查找只支持不区分大小写的纯文本匹配，看不到一共多少处、当前是第几处，不支持正则，打开查找时也不会带入当前选区。
- 用户故事：作为运维，我想在终端按 Ctrl+Shift+F 立刻看到“3/17”，并能切换 Aa 和 .*，快速在 ERROR 之间跳转。
- 验收：
  1. 输入即搜，状态显示“当前序号/总数”。
  2. “Aa”切换区分大小写，“.*”切换正则；两个按钮都有 aria-pressed，打开时高亮。
  3. 正则无效时输入框显示红框，并提示“正则无效 / Invalid regex”，不报错也不卡死。
  4. 有选区时打开查找，自动带入选区的第一行（不超过 200 字符）。
  5. Enter / Shift+Enter 在所有匹配间循环；Esc 关闭。
  6. 正则匹配时选区长度等于实际匹配的长度；空匹配跳过；最多统计 5000 处。

## 交互 / UI
- 查找栏从左到右：输入框、状态文字、计数（`--fs-xs`、`--color-text-secondary`、等宽数字）、Aa、.*、↑、↓、×。
- 开关打开时使用 `--color-accent-muted` 背景和 `--color-accent` 文字，圆角 `--radius-sm`。
- 状态文案：
  - 空输入：沿用快捷键提示。
  - 无匹配：“无匹配 / No matches”。
  - 正则错误：“正则无效 / Invalid regex”。
- 没有加载态，计算是同步完成的。

## 实现
- `lib/terminal-find.ts`：`compileFind`、`findAllInBuffer`、`pickMatch`、`seedQueryFromSelection`。
- 测试：`scripts/test-terminal-find2.ts`（8 项）。
- 截图：`terminal-find`。
