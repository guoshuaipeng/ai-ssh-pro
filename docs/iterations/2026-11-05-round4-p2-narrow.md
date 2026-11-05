# 2026-11-05 · Round 4 · P2 窄 AI 侧栏布局

## 问题
≤230px 侧栏时，仅建议决策行「状态 + 复制 + 填入」易折成三行；步骤 pill 与风险 pill 各自换行难看。

## 方案
- suggest-only：状态占满第一行（ellipsis）；Copy+Fill 保持 nowrap 一对。
- 步骤+风险包进 `ai-tool-meta` 成对 nowrap；描述仍可换行。

## 验收
`scripts/test-p2-narrow-ai-panel.ts`；真机窄栏待 tauri。
