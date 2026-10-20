# D92 终端「选中即复制」（可选）

- 需求：从 PuTTY / Xshell / MobaXterm 迁移过来的用户习惯鼠标选中即复制；现在必须右键 → 复制或按 Ctrl+Shift+C。终端是最高频路径。
- 去重：grep docs/iterations 与 src（copyOnSelect / 选中即复制 / rightClickPaste），均无结果。D91 与 cycle 6 的 SFTP 全部重试重复，已撤销。
- 方案：TerminalPrefs.copyOnSelect（默认关闭，主进程 normalize 只接受 true）；设置 → 终端 增加复选框（copy-on-select）。TerminalPane 复用 D78 的 mouseup 处理：有非空选区时写入本机剪贴板；不影响 D78「问 AI」浮动按钮。
- 取舍：不做“右键粘贴”，因为右键已是终端菜单；粘贴仍走 D7 多行预览。
