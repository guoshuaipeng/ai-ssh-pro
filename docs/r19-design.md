# Round 19 design (AI chat only)

## UX review (pre-code)
- Hierarchy: composer policy chip stays secondary; menu primary CTA = current effective policy option; confirm dock Agree stays sole primary CTA.
- Binding: policy chip/menu still show effective + source for this tab/session; pending dock still binds pendingConfirm.requestId on current conversation — never cross-host.
- Narrow (<=230px): chip must not ellipsis「执行前确认」into mystery; short Chinese chip labels + full aria-label/title; menu options >=40px touch; links padded. Confirm dock stacks main then actions; plan badge/run-steps keep tabular nums, no shrink-to-illegible.
- Empty/error: no session on dock keeps need-session CTA; menu without session keeps needSession note.
- Chinese: chip 需确认 / 仅建议 / 自动; menu keeps 执行前确认 / 仅建议 / 自动执行 + Short hints.

## Item 1 — policy menu touch / no-hover
- i18n `policy.chip.ask|suggest|auto` short labels on chip only.
- Chip `is-open` when menu expanded (focus-within / expanded state without hover).
- On open: focus current menuitemradio.
- Safety option min-height 40px; safety-link min-height 32px + padding; :focus-visible ring clear.
- Guard: test-r19-policy-menu-touch.ts

## Item 2 — confirm dock + plan progress narrow tighten
- `.ai-pending-confirm` @container 230px: main 100%, actions 100% wrap, no margin-left auto crush.
- Active-plan badge + run-steps/streak tighten gaps/margins; streak may wrap under steps.
- Tokens instead of raw 8/10px where touched.
- Guard: test-r19-confirm-dock-narrow.ts
