# D85 命令栏远程路径 Tab 补全

- 需求：在命令栏输入 `cat /etc/ngi`、`vim ./src/ap` 时，只能靠记忆或切 SFTP 查看；终端输入是最高频路径。
- 去重：grep docs/iterations 与 src（completePath / Tab 补全）无结果；现有 Tab 仅用于接受历史建议（X1）与 AI 结果（A2）。
- 方案：shared/path-complete.ts（pathTarget / resolveDir / completeFrom / escapeName）。只对“路径样”的非首个词生效（含 `/`、以 `.` 或 `~` 开头），裸词仍交给历史建议。
  - 相对路径按 D8 记录的会话 cwd 解析；`~/` 用 sftp.home；只调用 sftp.list，不在服务器上执行任何命令。
  - 唯一匹配：补全并追加 `/`（目录）或空格；多个匹配：补到公共前缀并 toast 列出候选（最多 12 个）；空格等特殊字符用反斜杠转义。
  - 只填入，不发送；读取期间用户继续输入则丢弃结果。隐藏文件只在前缀以 `.` 开头时参与匹配。
- 限制：不处理引号内路径；未知 cwd 的相对路径不补全。
