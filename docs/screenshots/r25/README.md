# Round 25 screenshots — failure evidence + short 「下一步 · n」

Captures the R21 failure evidence pin and R24 short next-confirm label via declarative op `aiFailureEvidence`.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r25-failure-evidence.png` | Failure pin wide | `ai-failure-evidence` + retry CTA + `has-failure-pin` |
| `*-r25-failure-evidence-narrow.png` | Failure pin narrow | same expects at narrow size |
| `*-r25-failure-next-confirm.png` | Failure + next dock | `ai-failure-next-confirm[data-aligned-step=2]` text `下一步 · 2` + Agree |
| `*-r25-failure-next-confirm-narrow.png` | Same, narrow | short label must not wrap poorly |

## Harness

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r25 --set chrome --only r25-failure-evidence,r25-failure-evidence-narrow,r25-failure-next-confirm,r25-failure-next-confirm-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r25 --no-build --set chrome --only r25-failure-evidence,r25-failure-evidence-narrow,r25-failure-next-confirm,r25-failure-next-confirm-narrow --themes dark,light
```
