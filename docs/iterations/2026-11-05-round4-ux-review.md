# Round 4 UX review — AI 对话面板（H03 / P2）

Adapted from dataai-ux-design-review. Written before code.

## Product bar
- One primary truth for execution: chip + menu + empty hint must agree with `resolveAiPolicy` + `planCommandConfirm`.
- No false 「一律确认」 when the chip says 「自动执行」.
- Chinese copy precise; calm chrome.

## Context binding (must)
1. Tab temp override (`tempPolicy`) feeds both the chip and the agent (`safetyContext.tempPolicy`).
2. Effective policy source (temp / host / global) stays visible in the menu.
3. Legacy `confirmBypassAllowed` (always false) only gates old `autoApproveLowRisk`; it must not be marketed as product-wide 「一律确认」.
4. Under tab 「自动执行」: read + medium write auto-write; high still confirms unless auto-high-risk is on.

## Layout & chrome (P2)
5. Narrow side panel (≤230px): suggest-only row — status on its own line (ellipsis); Copy + Fill stay one nowrap pair.
6. Step index + risk badge wrap as one meta pair; never mid-pill wrap; tool description may wrap below.
7. No duplicate CTAs; Agree never appears under 仅建议.

## H03 plan
- Align held-out H03 docs with real gated auto (already implemented).
- Fix empty / ladder copy that still promised confirm-always.
- Regression: temp auto + `date` / `touch` gates; agent skips HITL when `safetyMode === 'auto'`; `confirmBypassAllowed(true) === false` remains fail-closed for the legacy flag only.

## P2 plan
- CSS + light JSX meta wrapper; assert CSS/testid wiring.

## Must-verify (real UI)
- [ ] Tab → 自动执行 → empty hint mentions auto write; chip shows 自动执行 · 此标签页.
- [ ] Suggest-only card at ~220px width: Copy+Fill on one row under status.
- [ ] Multi-step plan: 「步骤 n」+ risk pill stay paired when panel narrows.
- [ ] Wide/narrow × dark/light if tauri available.

## After (acceptance)
- H03: empty hint branches on effective policy; ladderHint no longer says high-risk always confirms; H03 suite text matches gated auto.
- P2: `ai-tool-meta` + suggest-only CSS landed; unit tests green.
- Real UI wide/narrow × dark/light: **blocked** — release `ai-ssh-pro.exe` is v0.8.0 without HEAD; no `tauri dev` rebuild this round.
