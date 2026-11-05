# Round 34 screenshots — ZH/EN policy chip contrast

Ask / Suggest / Auto vs 需确认 / 仅建议 / 自动. Band-tinted chip (ok/warn/danger) + room for Suggest/仅建议.

| File | Locale | Policy | Notes |
|------|--------|--------|-------|
| `*-r34-zh-ask.png` | zh-CN | ask | chip **需确认** |
| `*-r34-zh-suggest.png` | zh-CN | suggest | **仅建议** |
| `*-r34-zh-auto.png` | zh-CN | auto | **自动** |
| `*-r34-en-ask.png` | en | ask | **Ask** (not Confirm) |
| `*-r34-en-suggest.png` | en | suggest | **Suggest** |
| `*-r34-en-auto.png` | en | auto | **Auto** |
| `*-r34-zh-ask-narrow.png` | zh-CN | ask | narrow |
| `*-r34-en-suggest-narrow.png` | en | suggest | longest EN short |
| `*-r34-zh-ask-pop.png` | zh-CN | ask | chip + menu full names |
| `*-r34-en-ask-pop.png` | en | ask | chip Ask + Confirm before run in menu |

Ops: `locale`, `aiPolicy`, `aiComposerPop`.

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r34 --set chrome --only r34-zh-ask,r34-zh-suggest,r34-zh-auto,r34-en-ask,r34-en-suggest,r34-en-auto,r34-zh-ask-narrow,r34-en-suggest-narrow,r34-zh-ask-pop,r34-en-ask-pop --themes dark,light
```
