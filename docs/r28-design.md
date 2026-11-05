# Round 28 design (AI dialog only)

## Gap scan (pre-Roadmap iter 3)

Roadmap iter 2 AI items vs R1-R27:

| ID | Item | Status |
|----|------|--------|
| 2.1 | Audit policy fields / readonly block logged | shipped R6 |
| 2.2 | Auto streak + stop | shipped R5 |
| 2.3 | Exec replay + audit-AI deep link | shipped R7/R17 |
| 2.4 | Prod x auto banner | shipped R2/R9 |
| 2.5 | Model presets | shipped R8 |
| H01-H08 | Held-out fixtures | shipped R9-R13 |

Still-open AI dialog gaps (not port-forward):

1. P1 Core-A evals omit safetyContext (S12 host named prod but protection stays normal) — this round high-freq
2. P2 Audit filter-empty deliberate state missing from shot matrix — this round polish
3. P3 Pending Decline visual weight vs Agree (R19) — this round polish
4. P2 Real Tauri wide/narrow x dark/light (Electron harness covers)
5. P3 English chip short labels / policy pop title wrap
6. Policy strategy cases stay held-out (do not fold H01 into Core-A)

## High-freq: Core-A safetyContext

- Optional fixture.safetyContext (align AiChatPayload.safetyContext)
- Pass through runOpenClawCoreAgentChat
- S12 (prod-web-01) sets protection: production; keep 34 cases; no new held-out policy asserts

## Polish

- Screenshot op auditFilterEmpty: seed one audit row, open with non-matching text → audit-filter-empty
- Pending dock Decline: transparent secondary; Agree stays primary CTA

## UX (pre-code)

- Primary CTA: pending Agree; Decline demoted
- Binding: filter-empty is local audit filters; safetyContext is fixture host for the turn
- Empty/error: filter-empty != true-empty; primary CTA = clear filters
