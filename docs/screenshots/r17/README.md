# Round 17 screenshots — ask progress + sticky batch

Extends the Round 14 Electron AI harness with R16 UI states.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r17-ask-progress.png` | Ask plan progress | `ai-run-steps` `data-policy=ask` + `ai-active-plan-step` |
| `*-r17-batch-sticky.png` | Sticky batch bar | `ai-batch-copy-bar` + fill-next + copy |
| `*-r17-batch-sticky-narrow.png` | Same @ 960×760 | Narrow composer / sticky bar wrap |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r17.mjs` (ops `aiAskProgress`, `aiBatchSticky`).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r17 --set chrome --only r17-ask-progress,r17-batch-sticky,r17-batch-sticky-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r17 --no-build --set chrome --only r17-ask-progress,r17-batch-sticky,r17-batch-sticky-narrow --themes dark,light
```
