# Round 13 — H02/H07 留出夹具 + 窄栏取消/续聊打磨

## UX 评审（编码前）
- 主 CTA：仅建议卡主操作仍是「复制命令」；取消卡主操作「重试」；D29 续聊芯片整颗可点。
- 会话/主机绑定：H02 闸门按当前策略档，不静默写 SSH；续聊仍按同主机归档。
- 空/错态：取消卡 ≠ 错误卡；窄栏不挤掉主 CTA。
- 冷静：窄侧栏（≤230px）标签/芯片 ellipsis，按钮 nowrap，不弹窗。

## 高频：H02 / H07 夹具化
- H02：`h02-suggest-only.json` + runner — suggest 下 write/high/interactive 零写入；只读仍 auto。
- H07：`h07-suggestion-steps.json` + runner — 步骤 n + 风险可读；与既有单元测同源断言。
- 不调 Core-A；不对照留出集调产品。

## 小打磨：R12 视觉债
- 取消卡头行：label 可折满行，重试按钮 nowrap。
- D29 芯片：max-width + ellipsis。
- suggest 行：沿用 Round4 布局，回归测锁住。

## 验收
- Core-A 34/34；held-out H01–H08（含新 H02/H07 runner）；窄栏 CSS 守卫绿。
