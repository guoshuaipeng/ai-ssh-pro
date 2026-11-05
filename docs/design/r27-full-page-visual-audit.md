# Round 27 design — full-page visual audit (AI dialog)

## UX review (before code)
- **Cadence**: every 3 rounds (last full-page: Round 24). Scope = AI panel chrome + related audit empty states, not whole app.
- **Pass**: code review of hierarchy / empty·error / failure-pin+memory / audit filter-empty + harness wide/narrow × dark/light where matrix already exists (R14–R26).
- **Main CTA**: failure pin still 「带证据重试」; Agree still only confirm primary; memory secondary; audit filter-empty primary = 「清空筛选」; true-empty ≠ filter-empty.
- **Binding**: jump-audit host + text must match a real audit row when we claim a hit; empty audit store must not be sold as 「筛选无命中」.
- **Empty/error**: keep R26 calm filter-empty copy; cancelled/error/stream accents stay distinct (R14).

## Findings (pre-fix, from matrix + code)

| Pri | Finding | Disposition |
|-----|---------|-------------|
| P2 | R26 jump-audit opens audit with filter text but **no seeded row** → true-empty / not a hit state | **R27 polish**: seed matching `appendAudit` before `OPEN_AUDIT`; re-shot expect table row |
| P2 | Memory close / jump-btn hit area `min-height: 28px` — borderline vs `--list-row-height: 32px` / R21 touch note | **R27 quick fix**: bump to 32px |
| P2 | True-device Tauri wide/narrow × dark/light still oral debt (R6+) | Keep Electron declarative matrix; no Tauri this round |
| P3 | Pending Agree/Decline/审计 Decline weight on 280px (R19) | Accept; backlog |
| P3 | Policy pop title wraps on narrow (R19) | Accept |
| P3 | EN chip short labels vs menu full names (R19) | Accept if not confusing |
| ok | Failure pin demotes memory chip (`:has(ai-failure-evidence)`) | R26 done |
| ok | filter-empty ≠ true-empty copy | R26 done |
| ok | Failure next 「下一步 · n」 + plan align | R22–R24 done |

## Item 1 — audit backlog + touch hit (quick P2)
- Append Round 27 full-page table to `docs/backlog.md`.
- CSS: `.ai-memory-close` / `.ai-memory-jump-btn` `min-height: 32px` (no token fallbacks).

## Item 2 — seed audit on jump + matrix `docs/screenshots/r27/`
- `aiMemoryEvidence.jumpAudit`: `appendAudit` matching host/source/type/detail → `aiss-audit-changed` → `OPEN_AUDIT`.
- Expect: audit table visible, count ≥1, **not** `audit-empty` / `audit-filter-empty`, search contains recent cmd.
- Also ship hierarchy co-presence + filter-empty intentional shot if cheap (optional); prioritize seeded hit.

## Must-verify
1. Core-A 34/34; held-out H01–H08 green.
2. `test-r27-*` wiring green; r27 shots expect true after rebuild.
3. Designer: memory jump/close ≥32px; jump-audit shows a row, not empty state.
