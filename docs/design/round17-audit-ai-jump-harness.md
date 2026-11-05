# Round 17 design — audit→AI jump + R14 harness expand

## UX review (pre-code)

### Binding
- Audit row host is the conversation label written at append (`conversationLabel`); jump must open AI for that host/tab when a live session matches, else still open AI on current pane.
- Focus target: prefer `exec.auditId === row.id`; fallback match `structured.command` / command text against `detail`.
- Non-AI rows: no jump CTA (or muted disabled) — inverse of R7 only makes sense for AI-sourced commands.

### Hierarchy / CTA
- Audit table: filters / export stay primary chrome; per-row 「对话」is secondary link weight (mirror ExecReplay 「审计」), never a competing primary.
- One calm highlight on the matched AI card (`is-audit-focus`); do not auto-Agree or auto-run.

### Empty / missing
- No matching turn: still open AI panel; toast「未在当前对话找到该步骤」; do not invent fake history.
- Audit off / empty table: unchanged.

### Polish (item 2)
- Expand Electron harness (R14 pattern) with ask plan-progress chip + sticky batch/fill bar; save under `docs/screenshots/r17/`.
- New ops must open the AI pane in App (same list as R14) and replay via `__aissShotAiOp`.

## Item 1 — jump back to AI dialog step
- `OPEN_AI_FROM_AUDIT_EVENT` (+ detail: id/host/text/tabNo) next to `OPEN_AUDIT_EVENT`.
- AuditLogPanel: AI command / ai.action rows → 「对话」button → dispatch.
- App: ensure AI visible; select matching conversation tab by label when possible; bump focus token.
- AIPanel: scroll/highlight card by auditId or command; brief `is-audit-focus`.
- Tests: `scripts/test-ai-jump-from-audit.ts`.

## Item 2 — R17 screenshot harness
- `scripts/ai-shot-matrix-r17.mjs`: `r17-ask-progress`, `r17-batch-sticky` (+ narrow).
- Hooks: `aiAskProgress`, `aiBatchSticky`.
- Inject into `screenshot-key-screens.mjs`; README under `docs/screenshots/r17/`.
- Tests: `scripts/test-r17-ai-shot-harness.ts`.

## Must-verify
1. Audit AI row 「对话」→ AI panel opens, matching exec/command card highlighted when present.
2. No match → panel opens + toast, no crash.
3. User-sourced row has no jump (or disabled).
4. Harness dark/light ask-progress + batch-sticky (narrow) under `docs/screenshots/r17/`.
5. Core-A 34/34; held-out green; unit tests green.
