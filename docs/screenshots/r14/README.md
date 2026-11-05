# Round 14 screenshots — AI state matrix

Standardized Electron harness for recurring AI-dialog visual QA.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r14-cancel-retry.png` | H05 cancel + Retry | `data-card=cancelled` + `ai-cancelled-retry` |
| `*-r14-d29-resume.png` | D29 troubleshoot chip | `ai-resume-last` `data-resume-kind=troubleshoot` |
| `*-r14-busy.png` | Busy + streaming | header `ai-busy-chip` + in-card Stop |
| `*-r14-prod-banner.png` | H01 / 2.4 prod banner | `ai-prod-auto-banner` (screenshot protection override) |
| `*-r14-suggest-narrow.png` | H02 suggest @ 960×760 | `safety-suggest` + Copy primary |
| `*-r14-accent-stack.png` | Accent hierarchy | streaming / cancelled / error left bars together |

## Harness (reproducible)

Declarative scenarios live in `scripts/ai-shot-matrix-r14.mjs` and are JSON-injected into the chrome set (no nested eval quotes).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r14 --set chrome --only r14-cancel-retry,r14-d29-resume,r14-busy,r14-prod-banner,r14-suggest-narrow,r14-accent-stack --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r14 --no-build --set chrome --only r14-cancel-retry,r14-d29-resume,r14-busy,r14-prod-banner,r14-suggest-narrow,r14-accent-stack --themes dark,light
```

### Gap fixes this round
1. Specialized AI ops must open the panel first (`aiChat empty`) or stash on `window.__aissShotAiOp` (App) for mount replay.
2. `reset` clears pending shot ops so scenarios do not leak.
3. Prod banner uses screenshot-only `protectionForUi` override (does not mutate host profile).

### Expect hooks
Each scenario carries a DOM `expect` checked by the harness (exit ≠ 0 on failure).
