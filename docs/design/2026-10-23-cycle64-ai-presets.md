# Round 64 design: AI vendor presets (quick pick)

Based on screenshots: `dark-settings-ai-presets.png`, `dark-settings-ai-ollama.png` (2026-10-20 c2).

## Current pain
- Vendors hide behind "从预设添加 ▾" context menu (6 items). Easy to miss; grows worse with 4 more.
- Base URL / model list / key are always manual fields; Ollama already shows keyless placeholder, but key field still looks required.
- Path today: open menu → pick → edit fields. Wanted path: see vendors → tap one → pick model → paste key → test.

## Target interaction
1. Settings → AI: always-visible vendor chip grid (existing 6 + siliconflow / modelscope / lmstudio / openrouter). Selected chip = `matchPreset(baseURL)`.
2. Tap chip → fill name, baseURL, model list, active model (first); clear key. Fields stay editable.
3. Active model: themed Select from list; custom IDs still via model-list textarea (keep existing power path).
4. When `keyOptional(baseURL)`: hide API Key input; show one muted line "本机无需 Key".
5. Primary actions stay: Save + Test connection (test uses live form, no save required).

## Visual
- Chip grid: wrap, `--space-*` gaps, `--fs-sm`; selected uses accent border/bg (theme tokens).
- Wide (1400) and narrow (1024 + side panel): chips wrap; one scroll in settings body.
- Dark + light: no hardcoded colors.

## Out of scope this round
- Fetching live model lists from providers; multi-column card gallery; changing execution-policy block above.
