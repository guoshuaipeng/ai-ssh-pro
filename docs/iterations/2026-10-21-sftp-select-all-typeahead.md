# D100 SFTP 全选与按名称跳转

- 核对：onPaneKey 已经处理了 Tab、Backspace、F5、上下键、Enter、Ctrl+Enter、F2、Delete，但没有 Ctrl+A，也不能像资源管理器那样输入首字母跳到对应文件。
- 方案：
  - Ctrl+A：选中当前可见的所有行，与筛选结果一致，并提示「已选中 n 项」。之后可以直接批量上传、下载或删除，删除仍需确认。
  - 输入可见字符：800ms 内连续输入的字符拼成前缀，复用 shared/select-nav 的 typeAheadIndex，选中第一个匹配的条目并滚动到可见位置。重复按同一个字母会在同首字母的条目之间循环。
  - 焦点在输入框时不拦截按键。
