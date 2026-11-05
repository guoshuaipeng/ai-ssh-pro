# Round 8 design: Roadmap 2.5 AI model presets UX

Based on: settings AI form (chip grid from c64), `docs/iterations/2026-10-20-model-presets.md`.

## UX review (AI-SSH adapted)
- Hierarchy: one clear path — pick vendor → fill Key (if needed) → Test → Save.
- Binding: preset must fill Base URL + models; Key never leaves the machine.
- Chinese copy: next step must be explicit; no wrong empty state.
- Calm chrome: chips grouped; one selected state; secondary = docs link.

## Current pain
1. Clicking a chip **overwrites** the active provider even when it already has a Key — contradicts B2「新建 Provider」and surprises users mid-setup.
2. Cloud vs local look the same; Ollama still feels like it needs a Key until you scroll.
3. After pick, only a muted hint; no 「下一步」banner.

## Target
1. Extract `planApplyPreset`: same baseURL → switch (keep Key); blank/unkeyed preset slot → fill; else → create new.
2. Chip grid: sections 「云端服务」/「本机」; badge 「需 Key」/「免 Key」.
3. Banner `data-testid="ai-preset-next"` after apply (need-key / keyless / switched-has-key).
4. Fields stay editable; Test + Save remain primary CTAs.

## Out of scope
- Live model list fetch; new vendors without docs; changing execution policy.
