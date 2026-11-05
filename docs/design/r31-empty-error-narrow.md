# Round 31 design — H08 empty/error narrow matrix + model-missing vs banner

## UX review (before code)
- **Scope**: AI dialog only. H08 empty / model-missing / HTTP error CTAs on **narrow** panel into `docs/screenshots/r31/`.
- **Empty hierarchy** (must stay distinct):
  1. `needs_config` → `ai-empty-state` + 「配置 AI」 (no composer)
  2. key ok, no model → `ai-model-missing` strip + 「去设置」
  3. reply-empty → starters (not this matrix focus)
  4. error card → primary CTA by code (401→settings, 429→retry)
- **Main CTA**: empty = 配置 AI; model-missing = 去设置; error settings-class = 配置/去设置; retry-class = 重试. Decline/clear stays secondary.
- **Binding**: screenshot ops are harness-only; do not mutate saved providers/keys.
- **Narrow**: config actions wrap; model-missing text ellipsis + CTA keep; error actions already wrap under `.ai-panel`.
- **Polish (R30 P3)**: model-missing + prod/readonly banner must not double-strip — hide host banners while model-missing is up (config gap wins).

## Item 1 — narrow empty/error shot matrix
- Ops: `aiEmptyConfig`, `aiModelMissing`; reuse `aiError` with `errorCode`.
- Shots (narrow primary + wide baselines): empty, model-missing, error-settings(401), error-retry(429).
- Fix wrap bugs found while shooting (config actions / missing strip / error CTAs).

## Item 2 — model-missing suppresses host banners
- `panelProdAuto && !needsModelPick`; same for readonly.
- Optional verify shot: force prod + model-missing → only model-missing visible.

## Must-verify
1. Core-A 34/34; held-out H01–H08 green.
2. `test-r31-*` green; r31 expect true after rebuild.
3. Designer: narrow empty/error readable; no model-missing+banner stack.

## After code
- Item1 `ecfbccf5`: ops + wrap CSS + matrix 6 core states × dark/light (+ vs-prod pngs staged).
- Item2 `f2de9460`: `needsModelPick` hides host banners; conflict shot `r31-model-missing-vs-prod-narrow`.
- Tests: Core-A 34/34; held-out H01–H08; `test-r31-*` green; screenshots 14/14.
- Round 32 suggestion: AI-dialog gap scan before Roadmap iter-3, or EN chip short-label check (port-forward still deferred). Next full-page visual: **Round 33**.
