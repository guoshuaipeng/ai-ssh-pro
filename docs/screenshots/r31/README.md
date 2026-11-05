# Round 31 screenshots — H08 empty / error narrow matrix

Narrow-first visual QA for empty config, model-missing, and HTTP error primary CTAs.

| File | State | Expect |
|------|-------|--------|
| `*-r31-empty.png` | needs_config empty | `ai-empty-state` + `ai-config-setup`; no model-missing / error |
| `*-r31-empty-narrow.png` | Same @ 960×760 | actions wrap; title readable |
| `*-r31-model-missing.png` | key ok, no model | `ai-model-missing` + settings CTA; **no** host banners |
| `*-r31-model-missing-narrow.png` | Same narrow | text wraps; CTA full-width ≤280px |
| `*-r31-error-settings-narrow.png` | `http_401` | `data-primary=settings` |
| `*-r31-error-retry-narrow.png` | `http_429` | `data-primary=retry` |
| `*-r31-model-missing-vs-prod-narrow.png` | model-missing + prod override | model-missing only; **no** prod banner |

Ops: `aiEmptyConfig` / `aiModelMissing` / `aiError`.

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r31 --set chrome --only r31-empty,r31-empty-narrow,r31-model-missing,r31-model-missing-narrow,r31-error-settings-narrow,r31-error-retry-narrow,r31-model-missing-vs-prod-narrow --themes dark,light
```
