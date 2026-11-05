# Round 29 UX review — AI 对话只读主机冷静横幅

Adapted from dataai-ux-design-review. Written before UI code.

## Product bar
- Calm chrome: readonly = info/ok tone (not warn/danger). One strip, no alarm spam.
- Chinese precise: 「只读主机 · AI 不会写入」— never imply silent write after unlock.
- One primary action on the strip: open policy (secondary chrome); Agree remains confirm CTA elsewhere.

## Context binding
1. Banner binds to **effective session protection** (`protection` / screenshot override), same source as policy chip.
2. Mutual exclusion with prod-auto: `prodAutoHint` already null on readonly; show at most one host-safety strip.
3. Policy menu still opens; ask/auto options stay capped (`policy.capMaxReadonly`) — banner is reminder, not a second gate.

## Behaviour
4. Show when raw `level === 'readonly'` (profile or session). Elevation may unlock **terminal** writes; **AI still never writes** (`aiWriteVerdict` / `aiEffectiveLevel`) — banner stays visible (do not hide on elevate), optional tip notes that.
5. No new intercept: main-process readonly block already exists; banner is visibility only.
6. Empty/error: banner ≠ model-missing / reconnect / general-mode.

## Polish
7. Screenshot matrix: wide+narrow × dark+light for `aiReadonlyBanner`.
8. Optional cheap smoke: unit `aiWriteVerdict` + `resolveAiPolicy` cappedBy readonly (not a new Core-A held-out case).

## Must-verify
- [ ] Readonly session: banner visible; click opens safety/policy.
- [ ] Production+auto: still only prod banner (no readonly strip).
- [ ] Elevated readonly: AI banner still on; no silent AI write path claimed.
- [ ] Core-A 34/34 + held-out green.
