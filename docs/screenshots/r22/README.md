# Round 22 screenshots — failure evidence pin (R21)

Captures the Round 21 S27 failure evidence card via declarative op `aiFailureEvidence`.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r22-failure-evidence.png` | Failure pin wide | `ai-failure-evidence` + retry CTA + `has-failure-pin` |
| `*-r22-failure-evidence-narrow.png` | Failure pin narrow | same expects at 1024 side panel |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r22.mjs` (op `aiFailureEvidence`).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r22 --set chrome --only r22-failure-evidence,r22-failure-evidence-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r22 --no-build --set chrome --only r22-failure-evidence,r22-failure-evidence-narrow --themes dark,light
```
