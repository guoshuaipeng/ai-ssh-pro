# Round 7 design — 2.3 jump-to-audit + H04/H05 real stop

## UX review (before)

### Binding
- AI panel host / tab #n must travel with audit deep-links; focusing an id alone fails when the open audit tab still filters another host.
- Confirm dock and command-history "recent" rows need a calm secondary path into the same filtered audit view (host + AI source + optional command text).

### Hierarchy / CTA
- ExecReplay: primary row = expand output; secondary = 审计记录 (one click).
- Confirm dock: Agree remains sole primary; 「本机审计」is ghost/link secondary — never competes with Agree.
- History suggest / Ctrl+R: 「审计」badge next to failed 「问 AI」, same visual weight as ask, not a second primary.

### Empty / missing
- No auditId: button stays muted but still opens filtered host+AI+command text (not a dead click); AuditLogPanel already shows focus-missing when id gone.
- Audit off: existing empty CTA to enable — unchanged.

### Streaming stop (H04/H05)
- Do not DOM-inject Stop. Drive real `busy` + streaming line via screenshot hook.
- Streaming card should show partial delta text + in-card Stop (same stopGeneration) so mid-stream interrupt is discoverable without hunting the composer icon.
- Edge: stop with busy but no streaming row yet → finalize cancelled assistant line; double-stop idempotent; stale turns still isolated.

## Must-verify
1. Click ExecReplay 审计 → audit tab host filter = conversation host, row focused when id present.
2. Confirm 「本机审计」→ audit filtered host + source=AI.
3. History 「审计」→ audit filtered host + text=command.
4. Screenshot / harness: real `[data-testid=ai-stop]` without createElement inject; streaming card shows partial + stop.
5. Core-A 34/34; new unit tests green.
