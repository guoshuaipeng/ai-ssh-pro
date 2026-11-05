# Round 11 UX review — AI 对话（H06 / H08）

Adapted from dataai-ux-design-review. Written before code.

## Product bar
- One primary CTA per empty/error surface; Chinese copy actionable; calm chrome.
- New chat must not silently answer from prior-session memory; restore is the only path back.

## Context binding (H06 · must)
1. Live transcript is keyed by `historyKey` / conversation ordinal; archive is opt-in restore.
2. 「新对话」clears live messages **and** prompt-facing thread facts (observations / recentCommands / working memory).
3. Agent session state must share the same thread id as `resolveThreadId(historyKey)` — not bare SSH `targetSessionId`.
4. After restore, 「我们上次磁盘结论是什么」is answered from **restored messages**, not from leaked silent memory.
5. Cross-key: key A’s live/archive never appears in key B’s request payload.

## Empty / error (H08)
6. Unconfigured (`!hasApiKey`): single primary 「配置 AI」; no composer pretend-ready.
7. Configured empty chat: `ai-reply-empty` + starters + optional D29 resume (explicit restore).
8. Key ok but no model: banner + settings CTA (not a white panel).
9. API error card: config/auth/model/unreachable → primary settings; rate/5xx → primary retry; human copy, no raw JSON.
10. No duplicate primary CTAs; secondary → overflow / ghost.

## Must-verify (real UI)
- [ ] New chat → ask about prior disk conclusion → no fact from old session without restore.
- [ ] History → restore old → ask same → answer cites restored turns.
- [ ] Unconfigured / 401 / empty-model / 429 each show correct primary CTA.
- [ ] Wide/narrow × dark/light if tauri available.

## After (acceptance)
- Held-out H06 fixture + runner green; Core-A 34/34.
- Held-out H08 fixture + runner green; empty/error wiring covered.
