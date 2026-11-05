# Round 3 UX review — AI 对话面板（H02 / H07）

Adapted from dataai-ux-design-review for AI-SSH-Pro AI panel. Written before UI code.

## Product bar
- Clear hierarchy; one primary CTA per surface.
- Chinese copy precise (suggest-only vs confirm).
- Calm chrome: suggest-only is informational, not an alarm.

## Context binding (must)
1. Session host + tab stay visible in `ai-session-context`.
2. Effective policy chip must match what the gate uses (`resolveAiPolicy`).
3. Under 「仅建议」, non-read commands never look runnable as Agree / Auto.
4. Copy / fill-into-bar are the only actions for suggested writes; SSH write count stays 0.

## Layout & chrome
5. Suggest-only decision row: status text + Copy (primary) + Fill (secondary). No Agree/Decline.
6. Tool/command suggestion cards: compact step index + risk tag; description wraps when needed; no duplicate CTAs.
7. Auto-read tool strips stay one-line muted; non-snapshot tool strips may wrap once.
8. Narrow side panel: step index + risk stay visible; copy remains reachable.

## H02 plan
- Gate: `observe`/`suggest` → write/high/interactive → mode `suggest`, `write=false`, `offerAgree=false` (interactive was incorrectly `agree`).
- Agent: keep `skipCommandWrite` for suggest/hold; note「只建议…未写入」.
- UI: SafetyCommandBar suggest branch shows copy+fill, never onAgree.
- Regression: restart/rm/reboot/top under suggest → no write; wiring asserts.

## H07 plan
- Number consecutive command/tool_call cards as 「步骤 n」.
- Keep risk badge next to step index on command/tool heads.
- Soft CSS for step pill; do not inflate card height.

## Must-verify (real UI when app available)
- [ ] Switch policy to 仅建议 → restart php-fpm card: no Agree; Copy/Fill work; terminal unchanged.
- [ ] Multi-step Docker CPU plan: steps numbered, each risk readable, confirm still required under 执行前确认.
- [ ] Wide + narrow, dark + light: suggest row and step pills not clipped.
- [ ] H01 prod banner + H05 stop state screenshots if tauri launches.
