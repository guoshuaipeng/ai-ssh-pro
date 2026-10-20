# D3 Ctrl+R 模糊搜索命令历史与片段 · P0（高频）

## 需求
- 问题：命令历史和片段的数据已经有了（X1 补全在用），但除了逐字前缀补全，没有一个能搜索的入口。
- 验收：
  1. 焦点在终端里时按 Ctrl+R，打开主题化浮层。焦点在别的输入框时不拦截。
  2. 子序列模糊匹配，命中的字符用 `--color-accent` 高亮。
  3. 排序：当前主机的历史 → 其他主机的历史 → 单行片段。查询为空时按最近使用排序。最多 50 条。
  4. Enter 只把命令填入终端，不执行。填入走 paste → onData 的路径，所以只读拦截照常生效。
  5. 在浮层里再按一次 Ctrl+R：关闭浮层，把 `\x12` 发给 shell，用 shell 自带的反向搜索。
  6. 列表为空时使用 EmptyState，文案说明哪些内容会出现在这里。

## 交互 / UI
- 复用命令面板的外观（cmdp）。命令用等宽字体；右侧徽标显示“本机 / 其他主机 / 片段”。
- 键盘：↑↓、Enter、Esc；关闭后焦点回到原来的位置。
- token：`--font-mono`、`--fs-xs`、`--radius-sm`、`--color-border-muted`。

## 实现
- `shared/quick-pick.ts` 中的 `fuzzyMatch`、`rankHistoryPick`。
- `components/QuickPick.tsx`。
- 截图：`qp-history`。
