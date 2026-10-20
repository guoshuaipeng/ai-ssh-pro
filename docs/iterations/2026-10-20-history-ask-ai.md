# D22b 历史失败项一键问 AI（2026-10-20，第 14 轮）

## 需求
命令栏建议与 Ctrl+R 历史中带"上次失败"标记的条目，一键把失败信息发给 AI。

## 设计
- 历史只存退出码（D22），不新增输出持久化。
- 本会话内存表（lib/failed-output.ts，纯逻辑在 shared/failed-output.ts）：监听 BLOCK_DONE_EVENT，按 (sessionId, 命令) 记住最近一次失败分块的上下文；同命令成功则清除；上限 50 条；只在内存。
- 点"问 AI"：有输出则发输出（复用 failedBlockContext 的截断上下文），否则发 `$ 命令` + `(exit N)`，并换用"无输出记录"的提问文案，避免 AI 假定看到了输出。
- 入口：CommandInput 建议行的"问 AI"小按钮（不触发选中、不夺焦点）；QuickPick 历史行同样按钮（先关闭面板）。均经 requestAskWithContext 进入 AI 面板，由用户再确认发送。

## 限制
只有开启分块（D18）时才能拿到输出；跨重启只有退出码。
