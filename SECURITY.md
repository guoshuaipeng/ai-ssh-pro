# Security policy

AI-SSH-Pro is a local SSH client. It does not run a cloud account service and it does not send telemetry.

## Supported versions

Security fixes are applied to the current `master` branch. Release tags follow the version in `package.json`.

## Reporting a vulnerability

Please do **not** open a public GitHub issue for a security problem.

Use [GitHub private vulnerability reporting](https://github.com/guoshuaipeng/ai-ssh-pro/security/advisories/new) for this repository. Include:

- the version (`package.json` or the About dialog)
- what an attacker can do
- whether it requires a malicious SSH server, a malicious local file, or only the UI

## How secrets are stored

- Session passwords, key passphrases, and LLM API keys are encrypted with Electron `safeStorage` when the OS provides it. If encryption is unavailable, the app may fall back to plaintext and log a console warning.
- Host keys live in a separate store named `ai-ssh-pro-known-hosts`.
- Recent connections record host, username, port, label, and time only. They do not record passwords, private-key paths, or passphrases.
- Command history (capped at about 200 entries) stores commands you explicitly send. A command that contains a secret stays in that local store until you clear history.
- Nothing in this repository should contain live credentials. Do not commit `.env`, key files, or session dumps.

## Batch execute

Batch execute runs one command on SSH sessions that are already connected in this app. It does not open new connections and it does not run until you click the Run button. Treat the command as you would a command typed into those terminals.

## Scope

This policy covers the AI-SSH-Pro application in this repository. It does not cover third-party SSH servers, LLM providers, or API keys you configure yourself.
