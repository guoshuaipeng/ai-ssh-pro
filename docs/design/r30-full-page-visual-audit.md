# Round 30 design — full-page visual audit (AI dialog) + process milestone

## UX review (before code)
- **Cadence**: every 3 rounds (last full-page: Round 27). Scope = AI panel chrome (banners, memory/failure, empty·error, narrow), not whole app.
- **Pass**: code review of hierarchy / empty·error / failure-pin+memory / readonly↔prod banners + harness wide/narrow × dark/light where matrix already exists (R14–R29).
- **Main CTA**: failure pin still 「带证据重试」; Agree still only confirm primary; banners are reminder strips (open policy), not primary action.
- **Binding**: banners bind session `protection` / screenshot override; readonly and prod-auto are mutually exclusive in JSX (`panelReadonly && !panelProdAuto`).
- **Empty/error**: config empty (`ai-empty-state`) ≠ model-missing ≠ reply-empty ≠ error card; cancelled/stream accents stay distinct (R14).

## Findings (pre-fix, from matrix + code R14–R29)

| Pri | Finding | Disposition |
|-----|---------|-------------|
| P2 | Host banners lack touch `min-height: 32px` (padding 6+fs-xs ≈28) vs list-row 32 / R27 memory rule | **R30 quick fix**: banner `min-height: 32px` |
| P2 | ≤230px: long ZH chip + hint compete; prod matrix (R14) has **no narrow** shot; readonly (R29) has narrow but no side-by-side contrast folder | **R30**: `@container` hide hint + ellipsis chip; contrast matrix `docs/screenshots/r30/` |
| P2 | True-device Tauri wide/narrow × dark/light still oral debt (R6+) | Keep Electron declarative matrix; no Tauri this round |
| P3 | Pending Decline weight / policy pop title wrap / EN chip short labels (R19) | Accept; backlog |
| P3 | model-missing + banner can stack (ok tone vs warn) — readable, no merge | Accept; watch in contrast shots |
| ok | Dual banner mutual exclusivity | R29 JSX |
| ok | Failure pin demotes memory; filter-empty ≠ true-empty | R26–R28 |
| ok | Memory touch ≥32px | R27 |

## Item 1 — audit backlog + banner narrow/touch (quick P2)
- Append Round 30 full-page table to `docs/backlog.md`.
- CSS after R29 banner block: min-height 32px; `@container (max-width: 230px)` hide hints; chip ellipsis (no token fallbacks).

## Item 2 — prod↔readonly contrast matrix `docs/screenshots/r30/`
- Shots: contrast-prod / contrast-prod-narrow / contrast-readonly / contrast-readonly-narrow × dark/light.
- Expect: exactly one banner family; Chinese chip text; mutual exclusion.

## Must-verify
1. Core-A 34/34; held-out H01–H08 green.
2. `test-r30-*` green; r30 shots expect true after rebuild.
3. Designer: banners ≥32px; narrow chip readable without crushed hint; prod warn ≠ readonly ok tone.

## After code
- Item1 `f2244676`: visual-audit backlog + design; banner `min-height: 32px` + ≤230px hide hint / chip ellipsis.
- Item2 `a72ffe9c`: contrast matrix `docs/screenshots/r30/` 8/8 expect true (prod/readonly × wide/narrow × dark/light).
- Docs: retro Round 30 + process note R25–R30; next full-page **Round 33**.
- Round 31 suggestion: AI-dialog empty/error narrow matrix, or Roadmap iter-3 dialog gap scan (port-forward still deferred).
