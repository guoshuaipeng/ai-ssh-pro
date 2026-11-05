# Round 29 screenshots — readonly host calm banner

Symmetric to `r14-prod-banner` / prod-auto strip: **readonly** host shows calm ok-tone banner in AI panel; no prod strip; AI writes stay blocked.

| File | State | Expect |
|------|-------|--------|
| `*-r29-readonly-banner.png` | demoHost + `aiReadonlyBanner` | `ai-readonly-banner` visible; no `ai-prod-auto-banner`; Chinese 只读 |
| `*-r29-readonly-banner-narrow.png` | Same, narrow | ellipsis on hint; chip readable |

Op: `aiReadonlyBanner` (AIPanel sets `screenshotProtectionOverride='readonly'`).

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r29 --set chrome --only r29-readonly-banner,r29-readonly-banner-narrow --themes dark,light
```
