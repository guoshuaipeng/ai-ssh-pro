# Round 20 screenshots — policy menu open + pending dock narrow

Extends the Electron AI harness with R19-debt states from Round 19 polish.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r20-policy-menu-open.png` | Strategy menu open | `ai-safety-pop` + chip `is-open` + current option focused |
| `*-r20-pending-dock-narrow.png` | Confirm dock narrow | `ai-pending-confirm` with `data-r19-narrow=1` + Agree |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r20.mjs` (ops `aiComposerPop` / `aiConfirm`).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r20 --set chrome --only r20-policy-menu-open,r20-pending-dock-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r20 --no-build --set chrome --only r20-policy-menu-open,r20-pending-dock-narrow --themes dark,light
```
