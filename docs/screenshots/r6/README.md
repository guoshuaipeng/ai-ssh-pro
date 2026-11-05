# Round 6 screenshots

Captured via Electron key-screen harness after guarding `WindowControls` (Tauri-only API was white-screening Electron QA).

## Matrix (dark + light)

| File | Maps to | Notes |
|------|---------|-------|
| `*-r6-audit.png` / `*-r6-audit-narrow.png` | 2.1 执行审计 | Source=AI filter; columns 来源/标签/结果/策略/详情 |
| `*-prod-auto.png` / `*-prod-auto-narrow.png` | H01 | Production banner + AI 自动执行 chip |
| `*-r6-h02-suggest.png` | H02 | Policy set to 仅建议 |
| `*-r6-h03-auto.png` | H03 | Safety pop with 自动执行 |
| `*-r6-p2-narrow.png` | P2 | Narrow AI panel (960×760) |
| `*-r6-streak.png` | auto-streak chip | Injected `ai-run-streak` for visual QA |
| `*-r6-h05-stop.png` | H05 | Stop control + input ready |
| `*-ai-exec-audit.png` | 2.1 from AI panel | Jump to audit from conversation |

## Not captured / caveats
- HEAD `src-tauri/target/debug/ai-ssh-pro.exe` smoke-launched; Win32 bring-to-front script hit `$PID` readonly — no native Tauri PNG this round. Electron harness used instead (same renderer for 2.1 UI).
- Streak / H05 stop chip: DOM-injected stand-ins when live runProgress not available in screenshot hooks.
- First blank matrix (solid `#0f1117`) caused by unguarded `@tauri-apps/api/window` — fixed in this round.

## Harness
```
node scripts/screenshot-key-screens.mjs docs/screenshots/r6 --set chrome --only prod-auto,prod-auto-narrow,r6-audit,r6-audit-narrow,r6-h02-suggest,r6-h03-auto,r6-p2-narrow,r6-streak,r6-h05-stop,ai-exec-audit --themes dark,light
```
Log: `harness2.log`.
