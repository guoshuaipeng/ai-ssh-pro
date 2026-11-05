# Process retro R13–R16 (2026-11-05)

- Time/round: ~35–55 min; always 1 high-freq AI-dialog + 1 polish; local commits only.
- Rework: R15 batch bar at tail → R16 sticky at first suggestion (visual debt correctly logged).
- User-facing gaps still open: real wide/narrow × dark/light matrix (debt since R6).
- Repeated ≥3: PowerShell inline patch fragility; screenshot matrix slippage; new tests missing from `test:parts` (fixed in R16).
- Standardize next: extend `ai-shot-matrix` JSON for new AI states; keep batch/plan helpers in `src/shared`.
