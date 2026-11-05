# Round 7 screenshots

- `dark-r7-h05-stop.png` / `light-r7-h05-stop.png` — real `aiStreaming` hook: composer Stop + in-card Stop + partial text (eval `stop/cardStop/partial/stream` all true). No DOM inject.
- `dark-ai-exec-audit.png` — ExecReplay 「审计记录」 jump opens audit tab.

Harness: `node scripts/screenshot-key-screens.mjs docs/screenshots/r7 --no-build --set chrome --only r7-h05-stop,ai-exec-audit --themes dark,light`
