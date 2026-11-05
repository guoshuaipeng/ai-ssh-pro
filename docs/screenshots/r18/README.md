# Round 18 screenshots — plan-step align + audit↔dialog

Extends the Electron AI harness with R18 deep-link / step-align states.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| `*-r18-plan-step-align.png` | Aligned plan steps | chip `data-aligned-step=2` + badge + `ai-step-index` agree (runProgress intentionally 7) |
| `*-r18-ai-to-audit.png` | AI → 审计 | `ai-exec-audit` jump button on ExecReplay |
| `*-r18-audit-to-ai.png` | 审计 → AI | card `is-audit-focus` / `data-audit-focus=1` |
| `*-r18-audit-open-ai.png` | 审计表「对话」 | `audit-open-ai` on AI-sourced rows |

## Harness

Declarative scenarios: `scripts/ai-shot-matrix-r18.mjs` (ops `aiPlanStepAlign`, `aiExecAuditLink`, `aiAuditFocus` + auditLog menu).

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r18 --set chrome --only r18-plan-step-align,r18-ai-to-audit,r18-audit-to-ai,r18-audit-open-ai --themes dark,light
```

Reuse prior build:

```
node scripts/screenshot-key-screens.mjs docs/screenshots/r18 --no-build --set chrome --only r18-plan-step-align,r18-ai-to-audit,r18-audit-to-ai,r18-audit-open-ai --themes dark,light
```
