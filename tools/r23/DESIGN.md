# Round 23 design (AI chat only) — UX review before code
# Product bar: one calm failure story; one primary CTA; Chinese precise.

## Item 1 — High-freq: dedupe failure pin vs ExecReplay status
Problem: when failure pin is shown, ExecReplay row still paints 「失败 · 退出码 N」in danger color → two failure headlines.
Design:
- Pin owns the failure story (title / kind / evidence / 带证据重试).
- With pin present, status row becomes quiet meta only: label 「执行输出」 (no 「失败」, no exit — exit lives in evidence + kind).
- Mute `.has-failure-pin` status/dot (not danger). Hide row audit button (pin already has 审计) to avoid duplicate CTAs.
Must-verify: wide+narrow, dark+light; failed without pin still shows 「失败 · 退出码」; ok/sent/blocked unchanged.

## Item 2 — Polish: after 「带证据重试」, auto-scroll to new confirm
Problem: retry submits a new ask; user stays on the failure pin while the new confirm card/dock appears below.
Design:
- Set a one-shot ref when non-exhausted 带证据重试 fires.
- When pendingConfirm appears, scroll card+dock to center, reuse is-after-failure-focus, focus Agree.
- Exhausted path stays composer focus (no confirm scroll).
Must-verify: rapid double-click retry while busy toasts; switch tab then back; no silent confirmStep/write.
