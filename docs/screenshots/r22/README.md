# Round 22 screenshots — failure evidence pin + next-confirm link

Captures the Round 21 S27 failure evidence card via declarative op `aiFailureEvidence`, plus Round 22 polish linking the pin to the next confirm dock.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r22-failure-evidence.png` | Failure pin wide | `ai-failure-evidence` + retry CTA + `has-failure-pin` |
| `*-r22-failure-evidence-narrow.png` | Failure pin narrow | same expects at narrow size |
| `*-r22-failure-next-confirm.png` | Failure + next dock | `ai-failure-next-confirm` + `data-after-failure=1` + Agree |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r22.mjs` (op `aiFailureEvidence`, optional `nextConfirm`).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r22 --set chrome --only r22-failure-evidence,r22-failure-evidence-narrow,r22-failure-next-confirm --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r22 --no-build --set chrome --only r22-failure-evidence,r22-failure-evidence-narrow,r22-failure-next-confirm --themes dark,light
```
