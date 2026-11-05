# Round 10 polish — AI busy chip

## UX review (before)
- Hierarchy: one calm status chip in the AI header; Send/Stop stays the only primary CTA in the composer.
- Copy: zh `ai.busy` was「生成中…」while the streaming card used「正在生成…」— unify to「正在生成…」.
- Binding: chip reflects *this panel’s* `busy`, not another tab’s turn.
- Empty vs busy: empty hint stays policy-aware; chip only mounts when `busy`.

## Must-verify
- Wide + narrow panel: chip does not shove the session context off-screen.
- Dark + light: chip contrast readable, no loud colors.
- Stop / finish: chip disappears with `busy`.
