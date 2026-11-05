# Round 33 screenshots — miss→New chat + EN Ask chip

Every-3 full-page visual audit deliverable: R32 surfaces that previously lacked a matrix.

| File | State | Expect |
|------|-------|--------|
| `*-r33-miss-toast.png` | zh-CN + `aiMissToast` (`toasts: true`) | info toast + action 新开对话 |
| `*-r33-miss-toast-narrow.png` | Same, narrow | message wraps; action stays |
| `*-r33-en-ask-chip.png` | `locale:en` + AI chat | chip label **Ask** (not Confirm) |
| `*-r33-en-ask-chip-narrow.png` | Same, narrow | ellipsis calm |
| `*-r33-en-ask-pop.png` | EN + `aiComposerPop` safety | Ask chip + open menu |
| `*-r33-en-ask-pop-narrow.png` | Same, narrow | menu readable |

Ops: `locale` (`en`\|`zh-CN`), `aiMissToast`.

```bash
node scripts/screenshot-key-screens.mjs docs/screenshots/r33 --set chrome --only r33-miss-toast,r33-miss-toast-narrow,r33-en-ask-chip,r33-en-ask-chip-narrow,r33-en-ask-pop,r33-en-ask-pop-narrow --themes dark,light
```
