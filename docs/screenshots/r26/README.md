# Round 26 screenshots — memory expand open / collapse / audit jump

Captures Round 25 working-memory expand UX via declarative op `aiMemoryEvidence` (`open`, `jumpAudit`).

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r26-memory-open.png` | Pop open | close + jump-btn + chip `.is-open` |
| `*-r26-memory-open-narrow.png` | Same, narrow | |
| `*-r26-memory-collapsed.png` | Chip only | `aria-expanded=false`, no pop |
| `*-r26-memory-collapsed-narrow.png` | Same, narrow | |
| `*-r26-memory-jump-audit.png` | After jump | audit panel + search = recent cmd |
| `*-r26-memory-jump-audit-narrow.png` | Same, narrow | |

## Harness

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r26 --set chrome --only r26-memory-open,r26-memory-open-narrow,r26-memory-collapsed,r26-memory-collapsed-narrow,r26-memory-jump-audit,r26-memory-jump-audit-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r26 --no-build --set chrome --only r26-memory-open,r26-memory-open-narrow,r26-memory-collapsed,r26-memory-collapsed-narrow,r26-memory-jump-audit,r26-memory-jump-audit-narrow --themes dark,light
```
