# Round 26 design — memory expand matrix + failure/memory hierarchy

## UX review (before code)
- **主 CTA**：记忆芯片仍是次要披露；近令「审计」只筛选、不执行。失败钉出现时「带证据重试」仍是失败主 CTA，记忆不得抢色/抢层级。
- **绑定**：跳转审计用当前会话 host 标签 + 近令全文 `query`；筛选条件落在本机审计表。
- **空/错**：审计「真·无记录」≠「有筛选无命中」——后者用冷静「没有符合筛选的记录」+「清空筛选」，禁止沿用「还没有审计记录」。
- **层级**：`:has([data-testid=ai-failure-evidence])` 时记忆芯片进一步 muted；弹层 z-index 不压过失败卡行动区。

## Item 1 — screenshot matrix `docs/screenshots/r26/`
| Shot | State |
|------|-------|
| memory-open (±narrow) | pop + 收起 + jump-btn |
| memory-collapsed (±narrow) | chip count, aria-expanded=false, no pop |
| memory-jump-audit (±narrow) | OPEN_AUDIT with filter text = recent cmd |

Op: extend `aiMemoryEvidence` with `open?: boolean` (default true) and `jumpAudit?: boolean`.

## Item 2 — polish
1. CSS demote memory chip while failure pin on screen.
2. AuditLogPanel: `events.length>0 && rows.length===0` → filter-empty copy + clear filters CTA.

## Round 27 note
Next full-page visual audit (every 3 rounds; last was R24).
