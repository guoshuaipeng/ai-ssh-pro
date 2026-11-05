# Round 16 design (AI chat only)

## UX review (pre-code)
- Hierarchy: composer `ai-run-steps` stays secondary chrome; streak only under auto; pending/active plan card gets one calm accent (not a second primary CTA).
- Binding: progress is this turn's planner loop (step/max + optional streak); batch fill/copy stays on current conversation lines + active session — never cross-host.
- Narrow (<=230px): run-steps already wraps full row; batch bar keeps count full-width then buttons; no shrink-to-illegible.
- Empty/error: no batch bar when <2 command steps; no fill-next without session (toast like D16).
- Chinese: 「第 n / max 步」对本轮规划通用；auto 仍显示「连续自动」；「逐条填入（n 条）」复用 d16b 口径。

## Item 1 — multi-turn plan progress visibility
- Always apply `progress` events to `runProgress` (ask/suggest/auto), not only auto.
- Keep streak chip only when `policy === 'auto'` (and caps present).
- Tip copy: non-auto → planning progress; auto → keep auto tip.
- Mark the pending-confirm card `is-active-plan-step` + `data-testid="ai-active-plan-step"` so the active plan step is visible in the transcript, aligned with composer step counter.
- Tests: extend run-control + new `test-r16-plan-progress.ts`.

## Item 2 — batch 填入下一条 + sticky near first suggestion
- Batch bar: sticky under messages head / before first command suggestion (not only at tail).
- Add secondary CTA 「逐条填入」 → `startScript(sessionId, commands)` when >=2 and session present.
- Keep 「复制全部步骤」; primary for suggest remains per-card Copy when policy is suggest-only.
- Tests: `test-r16-batch-fill-sticky.ts`.
