# D24 命令栏草稿按标签保留（2026-10-20，第 14 轮）

## 需求
同主机多标签切换时，命令栏里没发出的草稿不丢、也不串到别的标签。

## 现状
SessionCommandBar 只有一个实例，随活动标签换 sessionId；draft 是组件 state → 切标签后旧草稿带到新标签，切到非会话页（设置等）卸载后丢失。

## 设计
- 模块级内存 Map（shared/cmd-drafts.ts）按 sessionId 存草稿，空串即删除，上限 100；不落盘。
- setDraft 同步写 Map；sessionId 变化时从 Map 读回。
- 发给非活动会话的填充事件（AI 脚本等）写入该会话的草稿，切回即见。

## 限制
以 sessionId 为键：重连后 sessionId 改变，草稿不跟随；AI 模式/卡片状态不按标签保留。
