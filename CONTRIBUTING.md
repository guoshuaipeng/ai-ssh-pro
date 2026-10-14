# Contributing to AI-SSH-Pro

Thanks for helping improve AI-SSH-Pro. The project is MIT-licensed.

## Setup

```bash
npm ci
npm run dev
```

Before opening a pull request:

```bash
npm run typecheck
```

`node-pty` is optional. If it fails to build, SSH and the rest of the app still run; only the local shell is unavailable.

## What to include

- A short description of the behavior change.
- Manual test notes for UI changes (what you clicked and what you expected).
- Screenshots only when layout changes are hard to describe.

## Style

- TypeScript, React function components, and the existing Electron IPC shape: shared types → preload `window.aiss` → `ipcMain.handle` in the main process.
- Keep new UI in `src/renderer/src/components` instead of growing `App.tsx`.
- Match the surrounding code. Do not reformat unrelated files.
- Default interface copy is Simplified Chinese, with an English string in `src/renderer/src/lib/i18n.tsx` when you touch primary chrome.

## Secrets and privacy

Do not commit:

- `.env` files, private keys, or session exports that contain passwords
- API keys, host inventories from a real machine, or `electron-store` data from your userData directory

Recent connections must stay free of passwords, key paths, and passphrases. Do not add telemetry.

## Pull requests

Use a focused branch. GitHub Actions runs `npm ci` and `npm run typecheck` on pull requests.

## Reporting issues

Use the bug and feature templates. For vulnerabilities, follow [SECURITY.md](./SECURITY.md) instead of a public issue.
