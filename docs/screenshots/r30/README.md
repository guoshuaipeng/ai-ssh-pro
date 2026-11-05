# Round 30 screenshots — prod↔readonly banner contrast

Every-3 full-page visual audit deliverable: **same folder** compares production auto-run warn strip vs readonly calm ok strip (wide/narrow × dark/light).

| File | State | Expect |
|------|-------|--------|
| `*-r30-contrast-prod.png` | demoHost + `aiProdBanner` | `ai-prod-auto-banner` only; Chinese 自动 |
| `*-r30-contrast-prod-narrow.png` | Same, narrow | chip readable; hint hidden ≤230px (R30 CSS) |
| `*-r30-contrast-readonly.png` | demoHost + `aiReadonlyBanner` | `ai-readonly-banner` only; Chinese 只读 |
| `*-r30-contrast-readonly-narrow.png` | Same, narrow | chip readable; hint hidden ≤230px |

Ops: `aiProdBanner` / `aiReadonlyBanner` (AIPanel `screenshotProtectionOverride`).

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r30 --set chrome --only r30-contrast-prod,r30-contrast-prod-narrow,r30-contrast-readonly,r30-contrast-readonly-narrow --themes dark,light
```
