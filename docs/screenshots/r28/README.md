# Round 28 screenshots — audit filter-empty + pending Decline demoted

Deliberate **filter-empty** (events exist, filters match none) vs true-empty; pending Decline visual weight below Agree.

| File | State | Expect |
|------|-------|--------|
| `*-r28-audit-filter-empty.png` | Seeded audit + non-matching query | `audit-filter-empty` + clear CTA; not `audit-empty` / table |
| `*-r28-audit-filter-empty-narrow.png` | Same, narrow | |
| `*-r28-pending-decline-demoted.png` | Pending dock | Decline transparent; Agree accent |
| `*-r28-pending-decline-demoted-narrow.png` | Same, narrow | |

Op: `auditFilterEmpty` (App seeds `appendAudit` then `openAudit` with miss text).

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r28 --set chrome --only r28-audit-filter-empty,r28-audit-filter-empty-narrow,r28-pending-decline-demoted,r28-pending-decline-demoted-narrow --themes dark,light
```
