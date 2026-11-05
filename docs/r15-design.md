# Round 15 design (AI chat only)

## UX review (pre-code)
- Hierarchy: composer chips stay secondary chrome; policy menu primary CTA is the effective-policy option; batch copy is secondary to per-step Copy.
- Binding: policy chip still shows effective policy + source; host/session context stays in header (unchanged).
- Narrow (<=230px): chips wrap; labels ellipsis; safety pop spans bar width; menu labels may wrap; no shrink-to-illegible font.
- Empty/error: batch-copy bar absent when <2 command steps; copy failure still uses ai.copyFailed toast.
- Chinese: 「复制全部步骤」「共 n 步命令」.

## Item 1 — composer policy menu narrow wrap
- `.ai-composer-bar` flex-wrap + row-gap.
- Safety/model chip label ellipsis; @container 230px tighten model max-width; allow menu label wrap; safety-head wraps.
- Guard test: test-r15-composer-policy-narrow.ts

## Item 2 — multi-step batch copy
- Pure helper collectSuggestionCommands(lines) → commands[].
- When >=2 commands: bar with 「复制全部步骤」 copies join("\n").
- Place before messages tail; data-testid ai-batch-copy / ai-batch-copy-bar.
- test-r15-batch-copy-steps.ts + held-out wiring optional.
