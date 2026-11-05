# Round 21 design (AI chat only)

## Cadence
- Every 3 rounds: full-page light visual audit → backlog (this round).
- High-freq + one polish; local commits only.

## UX review (pre-code)
- Hierarchy: after a confirmed command fails, evidence is pinned on that reply card — not buried only in collapsed ExecReplay. Primary CTA =「带证据重试」(new ask / new confirm). Agree on a fresh confirm card stays the only write path. No silent re-run.
- Binding: evidence + retryBudget belong to this card's command / requestId / conversation host — never cross-host.
- Chinese: 命令失败 / 不会自动重跑 · 重试须新的确认 / 带证据重试 / 重试预算已用尽.
- Empty/error: no failure pin when status≠failed; exhausted budget disables write-shaped CTA, still allows「换个问法」into composer.
- Narrow: failure pin stacks title → evidence pre → actions; memory chip ultra-narrow shows count-only with title/aria.

## Item 1 — failure evidence card (align S27)
- Extend ExecRecord: failureKind, evidence, retryBudget {count,cap,exhausted}.
- Agent: classify before emitting exec; attach fields when failed.
- UI: pinned block on failed reply (`data-testid=ai-failure-evidence`); kind + evidence + no-auto-retry note; CTA「带证据重试」→ new submitToAi citing evidence (never confirmStep/write); exhausted → toast + composer fill only.
- Guard: test-r21-failure-evidence.ts (+ normalizeExecRecord round-trip).

## Item 2 — memory chip ultra-narrow + visual audit → backlog
- @container ≤230px: hide `.ai-memory-chip-label`, keep count; aria-label = 记忆 · n + summary.
- Light full-page visual audit from R14–R20 shot matrix + code chrome; findings → backlog with P1/P2/P3.
- Guard: test-r21-memory-chip-narrow.ts; docs commit for audit notes.

## UX review (post-code) — must verify
- Failed card shows evidence without expand; Retry does not write SSH.
- Budget exhausted: no silent write; Chinese exhausted copy.
- Memory chip ≤230px: count visible, label hidden, title intact.
- Core-A 34/34 + held-out green.
