# D81 SFTP 列头点击排序（名称 / 大小 / 时间）

- 需求：找大文件、找最新日志是日常浏览动作；目前只有“按名称 / 按时间”切换按钮，不能按大小，也不能反向。
- 核查：shared/sftp-sort.ts 仅 name|mtime 且方向固定；表头是纯文本。docs/iterations 无相关条目（sftp-keys / sftp-narrow-pathbar 不涉及排序）。
- 方案：sortSftpEntries 增加 size 与 flip；列头改为按钮（data-testid sftp-th-name/size/mtime），同列再点翻转，换列回到自然方向（名称 A→Z、时间新→旧、大小大→小），显示 ↑/↓ 与 aria-sort；目录始终在前。工具栏按钮保留，标签反映当前列。
- 本地/远程两栏共用一个排序状态。
