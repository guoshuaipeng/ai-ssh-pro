# Round 5 design — Roadmap 2.2 auto streak + visible steps

## Problem
2.2 already has maxSteps + 「第 n / 上限」+ stop. Gaps:
1) progress uses lastPolicy from the previous command, so step 1 never shows the counter under auto.
2) under auto, write commands can silent-chain for the whole maxSteps budget with no mid-run pause.

## Design
- Resolve policy once before the planner loop (same inputs as each command) so progress always carries effective policy from step 1.
- New setting aiAutoStreak (1–30, default 5): consecutive auto-written non-read commands. When streak >= cap, next writable auto candidate is forced to agree (HITL), Chinese note on the card.
- Read / suggest / hold / already-strong do not consume or trip the streak. User Agree resets streak to 0. Cancel ends the run (existing).
- Composer: keep 「第 n / max 步」; when streak>0 under auto show 「连续自动 n / cap」; when forced, chip tip explains 需确认.
- Settings: under 自动执行 advanced, row 「连续自动上限」.

## UX review (pre)
- One primary CTA on forced card remains Agree; Decline secondary.
- Chinese copy precise; empty/settings hints not claiming always-confirm.
- Narrow panel: streak chip nowrap tabular-nums like run-steps.
