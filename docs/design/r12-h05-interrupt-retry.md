# Round 12 — H05 可打断可重试 + D29 排错续聊

## UX 评审（编码前）
- 主 CTA：停止后取消卡上「重试」为主按钮；停止仍为生成中唯一主操作。
- 会话绑定：重试走 submitToAi 新 turn，不复活已 stopped 的 turn。
- 空/错态：取消≠错误卡；文案「已取消」+ 可行动重试；不白屏。
- 冷静：不弹窗；composer 立即可输入；busy 时重试 toast「请先停止」。

## H05
- 流式中途 Stop → partial 定格、cancelled 标记、late delta 忽略。
- 点重试 = 新 turn（同用户原文），旧 turn 保持 stopped。
- 夹具：tests/fixtures/held-out/h05-interrupt-retry.json（不调 Core-A）。

## D29 小打磨
- resumeCandidate 同主机 7 天内优先标题像排错的归档。
- 芯片：排错用「继续上次排错」，否则「继续上次对话」。

## 验收
- Core-A 34/34；held-out H01–H08（含新 H05）；宽窄×深浅待 rebuild。
