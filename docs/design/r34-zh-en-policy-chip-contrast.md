# R34 design — ZH/EN policy chip contrast

## Goal
Composer policy chip shorts stay clear in both locales on dark+light, wide+narrow:
- ZH: 需确认 / 仅建议 / 自动
- EN: Ask / Suggest / Auto (never Confirm — Agree CTA)

## UX
- One primary story: chip band tone (ok/warn/danger) + short label.
- Menu keeps full names (执行前确认 / Confirm before run).
- aria/title still use full effective + source.

## Change
- Screenshot op `aiPolicy` sets tab temp policy.
- CSS: band tint via color-mix; label max-width 5.75em / narrow 4.5em so Suggest/仅建议 rarely clip to mystery glyphs.
- Matrix: 10 states × dark/light.

## Must-verify
- EN Ask ≠ Confirm; ZH 需确认 visible on warn tint.
- Narrow Suggest still readable or calm ellipsis with title.
- Pop: chip short + menu full labels both visible.
