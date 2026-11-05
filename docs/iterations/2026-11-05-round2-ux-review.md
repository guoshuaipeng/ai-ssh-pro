# Round 2 UX review — AI 对话面板（H01 / H04·H05）

Adapted from dataai-ux-design-review for AI-SSH-Pro AI panel. Written before UI code.

## Product bar
- Clear hierarchy; one primary CTA per surface.
- Chinese copy precise (stop / empty / error).
- Calm chrome for production safety (warn, not alarm spam).

## Context binding (must)
1. Session host label + tab #n stay visible in `ai-session-context`.
2. Production protection must be visible in the AI panel when it matters — not only on the terminal guard banner.
3. Auto-run on production must surface a chip that opens the policy menu (same as terminal `banner-ai-auto`).
4. Destructive (high-risk) proposals on production never look like a normal Agree; never silent write.

## Layout & chrome
5. One primary CTA: Stop while busy; Send when idle; after stop, Send returns without stuck busy.
6. Empty/error: stopped mid-stream uses「已停止生成」/ cancelled copy — not「没有匹配」or a blank streaming card.
7. Retry after stop is a new turn (re-submit last user ask); do not continue the aborted stream.
8. Composer stays typable after Stop; no stuck `busy` that blocks Enter/Send/Retry.

## H01 plan
- Shared hint: production + effective auto → panel strip (reuse `prodAutoHint` / `OPEN_AI_POLICY_EVENT`).
- Main agent: if effective protection is production and command kind is high and mode would be auto → force confirm (`strong`/`agree`); never silent high-risk write on prod.
- Soft tag hint: profile tagged prod but level still normal → calm「建议开启生产保护」in panel (optional, only when session bound).

## H04/H05 plan
- On stream `cancelled`: clear streaming placeholder + `setBusy(false)` immediately for that turn.
- Stop click: abort + keep input usable; focus composer when idle again.
- Retry: still blocked while truly busy; after cancel, new `submitToAi` turn.
- Regression tests for hint + stop/busy wiring; keep Core-A 34/34.

## Must-verify (real UI when app available)
- [ ] Wide + narrow AI panel, dark + light: prod+auto chip visible; click opens policy menu.
- [ ] Production + high-risk: confirm CTA, no auto-run badge alone.
- [ ] Stop mid-stream → streaming card becomes stopped; Send returns; typing/Enter works; Retry sends new turn.
- [ ] Rapid two asks: replies stay on correct turn (no cross-stream).
