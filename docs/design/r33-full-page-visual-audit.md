# Round 33 design — full-page visual audit (AI dialog)

## UX review (before code)
- **Cadence**: every 3 rounds (last full-page: Round 30). Scope = AI panel chrome + R32 surfaces (miss→新开对话, EN Ask chip), not whole app / port-forward.
- **Pass**: code review of hierarchy / empty·error / host banners / memory·failure / deep-link miss / policy chip + harness wide/narrow × dark/light for new R32 states.
- **Main CTA**: miss toast action = 新开对话 / New chat; Agree still only confirm primary; failure pin still 「带证据重试」; chip short label ≠ Agree.
- **Binding**: new chat stays on current host/session key; chip/aria bind tab policy + source; locale shot must not leak into unrelated zh expects.
- **Empty/error**: miss toast ≠ filter-empty ≠ true-empty; model-missing still suppresses host banners (R31).

## Findings (from R14–R32 matrix + code)

| Pri | Finding | Disposition |
|-----|---------|-------------|
| P2 | R32 miss→新开对话 + EN Ask chip shipped without screenshot matrix | **R33**: `docs/screenshots/r33/` miss toast + EN chip (wide/narrow × dark/light) |
| P2 | Long miss toast copy + action: message `<span>` lacks `min-width: 0` → crush/overflow risk | **R33 quick fix**: toast message flex wrap; `data-testid=toast-action` |
| P2 | `test-r31-*` / `test-r32-*` not wired into `package.json` `test:parts` | **R33 polish**: wire R31–R33 |
| P2 | True-device Tauri wide/narrow × theme still oral debt (R6+) | Keep Electron declarative matrix; backlog |
| P3 | Pending Decline weight / policy pop title wrap | Accept |
| P3 | EN chip「Ask」vs conversational “ask” — intentional (R32; not Confirm CTA) | Accept; matrix documents Ask/Suggest/Auto |
| ok | Dual banner mutex; model-missing hides banners; miss→startNewChat; chip shorts zh/en | R29–R32 |

## Item 1 — audit backlog + toast wrap (quick P2)
- Append Round 33 full-page table to `docs/backlog.md`.
- CSS after toast block: message span `flex:1; min-width:0`; toast with actions `align-items:flex-start` via `:has(.toast-actions)`; no new token fallbacks.
- ToastHost action button `data-testid="toast-action"`.

## Item 2 — miss + EN chip matrix `docs/screenshots/r33/`
- Ops: `aiMissToast`, `locale` (`en` | `zh-CN`).
- Shots: miss toast zh; EN Ask chip (+ optional safety pop); wide/narrow × dark/light.
- Expect: toast action 新开对话; chip label Ask; zh shots reset locale.

## Must-verify
1. Core-A 34/34; held-out H01–H08 green.
2. `test-r33-*` + wired R31/R32 green; r33 shots expect true after rebuild.
3. Designer: miss toast readable with action; EN chip Ask ≠ Agree; narrow chip ellipsis calm.
