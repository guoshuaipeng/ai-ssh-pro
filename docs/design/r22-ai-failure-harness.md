# Round 22 design — AI failure evidence harness + link/toast polish

## UX review (before code)
- Hierarchy: failure pin stays the loudest after a failed confirm; primary CTA remains「带证据重试」; Agree stays the only primary on the next confirm dock.
- Matrix: wide + narrow × dark + light for `aiFailureEvidence` so R21 pin is designer-visible without manual DOM inject.
- Polish link: failure card may offer a secondary「下一步待确认」that scrolls/highlights the pending dock — never a second Agree, never silent SSH write.
- Audit miss (R17 debt): keep `kind: info` (weak/calm, not error red); clearer Chinese; action「回到顶部」scrolls the AI message list. Empty match ≠「没有匹配」misuse — copy says the step is not in *this* chat.

## Must-verify
1. `docs/screenshots/r22/` dark/light × wide/narrow failure evidence expects green after rebuild.
2. Narrow: failure actions wrap; retry still full-width-ish; no clipped title.
3. With pending confirm after failure: dock `data-after-failure=1` + secondary chip; Agree still primary.
4. Audit jump miss: info toast + 回到顶部; panel already open.
