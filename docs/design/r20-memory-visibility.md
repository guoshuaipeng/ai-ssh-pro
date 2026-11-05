# Round 20 — AI 对话工作记忆可见性（设计短笺）

## 问题
面板只露出「当前目标」一行；主机线索 / 观测子弹在主进程里，用户看不见 Agent 这轮到底记了什么，难核对串会话或空证据。

## 方案（诚实、小、非 dump）
- 在会话上下文旁增加次要芯片 **「记忆 · n」**（n=可见证据条数；无证据则不渲染）。
- 点开：最多 **3** 条，中文标签「主机线索 / 观测 / 近令」；单条 ≤48 字 + title 全文。
- 目标仍用既有 `ai-working-goal`（主标注）；证据不抢 Agree / 发送主 CTA。
- 数据绑定 `persistKey`（与 getWorkingMemory 同会话）；新对话清空后芯片消失。
- IPC：保留 `ai:workingMemory:get`；新增 `ai:workingMemory:snapshot` → `{ goal, hostFacts, observations, recentCommands }`；UI 经 `@shared/working-memory-view.buildMemoryEvidenceView` 裁剪。

## UX 验收
1. 有目标无观测 → 只显示目标，无「记忆 · 0」。
2. 有观测 → 芯片 count 正确；展开 ≤3；不出现滚动长列表。
3. 换会话 / 新对话 → 证据跟 key 走，不串主机。
4. 窄栏：芯片 ellipsis；展开层不撑破 composer。
5. 中文；空态不装「没有匹配」。

## 不做
全文 dump、跨主机全局记忆、改 Core-A 评分、假造观测。
