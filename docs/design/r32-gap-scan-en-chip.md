# Round 32 design — pre–iter-3 AI dialog gap scan + EN policy chip i18n

## Gap scan (Roadmap 迭代 3 前；端口转发默认不接)
Iter 2 (2.1–2.5) + held-out H01–H08 already shipped. Remaining **AI-dialog** gaps:

| Pri | Gap | Notes |
|-----|-----|-------|
| **P2** | Audit→AI miss recovery still “Back to top” only | R17/R22 debt: user needs calm path to **新开对话** on this host without fabricating history |
| **P3** | EN chip `Confirm` / `Suggest` / `Auto` | `Confirm` reads as a CTA (collides with Agree); zh uses state-like 需确认. Align EN shorts to **Ask / Suggest / Auto** (ids + single word); menu keeps full names; aria/title keep full `policy.*` |
| P2 | True Tauri wide×narrow×theme matrix | Electron harness covers; keep declarative, don’t block this round |
| P3 | Decline weight / policy pop title wrap | Acceptable |

**Ship this round:** (1) miss toast → New chat action; (2) EN chip short-label consistency.

## UX review (before code)
- **Main CTA on miss:** toast action = 新开对话 / New chat → `startNewChat` (archives if needed; never invents matching history).
- **Empty/miss copy:** keep calm info theme; message may hint that a new chat on this host is the recovery path.
- **Binding:** new chat stays on current conversation/host key; does not switch tabs.
- **Policy chip:** visible short label ≠ Agree; hover/aria still full policy name + source.
- **i18n:** zh chip unchanged (仅建议/需确认/自动); EN chip Ask/Suggest/Auto; menu Suggest only / Confirm before run / Auto run unchanged.

## Item 1 — audit miss → new chat
- `buildAuditOpenAiMissToast`: keep keys; retarget `au2.openAiMissAction` to New chat; optional message tweak.
- AIPanel miss branch: call `startNewChat` via ref (effect sits above callback).
- Update R22 / jump-from-audit asserts.

## Item 2 — EN policy chip shorts
- `policy.chip.ask` en: Confirm → Ask; assert suggest/auto too.
- Extend `test-r19-policy-menu-touch` (or new `test-r32-en-policy-chip`) for full zh/en matrix.

## Must-verify
1. Core-A 34/34; held-out H01–H08 green.
2. Miss toast action starts new chat when lines exist; empty chat → existing empty toast.
3. EN chip label Ask/Suggest/Auto; menu full names; aria uses full title.
4. Round 33 = full-page visual audit.
