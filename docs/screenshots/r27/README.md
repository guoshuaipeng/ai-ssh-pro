# Round 27 screenshots — seeded jump-audit hit + failure/memory hierarchy

Full-page visual audit follow-through: jump-audit must show a **matching row**, not true-empty / filter-empty.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r27-jump-audit-hit.png` | Seeded audit + jump | `audit-table`, not empty/filter-empty; search = recent cmd |
| `*-r27-jump-audit-hit-narrow.png` | Same, narrow | |
| `*-r27-failure-memory.png` | Failure pin + memory chip | memory muted (`opacity` demoted) |
| `*-r27-failure-memory-narrow.png` | Same, narrow | |

Op: `aiMemoryEvidence` with `jumpAudit: true` (default `seedAudit: true`) appends a matching AI command audit row before `OPEN_AUDIT`.

## Harness

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r27 --set chrome --only r27-jump-audit-hit,r27-jump-audit-hit-narrow,r27-failure-memory,r27-failure-memory-narrow --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r27 --no-build --set chrome --only r27-jump-audit-hit,r27-jump-audit-hit-narrow,r27-failure-memory,r27-failure-memory-narrow --themes dark,light
```
