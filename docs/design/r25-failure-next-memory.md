# Round 25 design — failure 「下一步 · n」 matrix + memory expand UX

## UX review (before code)

### Item 1 — failure evidence matrix (high-freq)
- Hierarchy: failure pin primary CTA stays「带证据重试」; 「下一步 · n」 secondary link; dock Agree remains the only primary confirm.
- Binding: `data-aligned-step` on the next-confirm link must match plan chip / dock (R24); matrix proves short copy visible after rebuild.
- Matrix: wide + narrow × dark + light for failure pin; plus next-confirm short-label state (wide + narrow) → `docs/screenshots/r25/`.
- Must-verify: expect checks `ai-failure-next-confirm[data-aligned-step="2"]` and text `下一步 · 2` (or `Next · 2`); pending dock `data-after-failure=1`.

### Item 2 — working-memory expand (polish)
- Touch: memory chip min-height ≥28px + padding (closes R21/R24 P2 hit target).
- Collapse: explicit「收起」 in pop head; Escape + outside click kept.
- Jump: `recentCommand` rows open audit filtered by full command text (not truncated display); hostFact/observation stay non-clickable.
- Hierarchy: memory remains secondary disclosure — never a second Agree / silent write.
- Empty: no「记忆 · 0」; no「没有匹配」misuse when audit filter finds nothing (existing audit chrome handles empty).

## Must-verify after code
1. `docs/screenshots/r25/` dark/light × failure / failure-narrow / next-confirm / next-confirm-narrow green.
2. Chip tap area comfortable; close collapses; 近令 jumps audit then closes pop.
3. Core-A 34/34 + held-out H01–H08 green.
