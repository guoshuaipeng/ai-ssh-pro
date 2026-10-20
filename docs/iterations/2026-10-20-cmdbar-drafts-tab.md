# D24b 草稿与 AI 模式按标签保留，重连不丢（2026-10-20，第 15 轮）

## 需求
重连后（sessionId 变化）命令栏草稿与 AI 模式仍跟随原标签。

## 设计
- SessionCommandBar 新增 draftKey，App 传 activeTab.tabId（重连不变）；草稿与 AI 模式两张内存 Map 均以它为键。
- 发给后台会话的填充仍按 sessionId 暂存，切到该标签时迁移到标签键（loadDraft）。
- 重连期间命令栏卸载，模块级 Map 不受影响。仍不落盘。

## 限制
AI 结果卡片（aiCard）不按标签保留，切走即关闭，避免把旧结果误发到别的主机。
