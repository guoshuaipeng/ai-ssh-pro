from pathlib import Path

i18n = Path("src/renderer/src/lib/i18n.tsx")
text = i18n.read_text(encoding="utf-8")

zh_anchor = "  'au2.count': '共 {n} 条',\n"
zh_insert = zh_anchor + """  'au2.source': '来源',
  'au2.sourceAll': '全部来源',
  'au2.sourceAi': 'AI',
  'au2.colSource': '来源',
  'au2.colTab': '标签',
  'au2.colPolicy': '策略',
  'au2.out.allowed': '已允许',
  'au2.out.blocked': '已拦截',
  'au2.out.cancelled': '已取消',
  'au2.srcGlobal': '全局',
  'au2.srcHost': '主机',
  'au2.srcTemp': '临时',
  'au2.capped': '受{by}限制',
"""

en_anchor = "  'au2.count': '{n} entries',\n"
en_insert = en_anchor + """  'au2.source': 'Source',
  'au2.sourceAll': 'All sources',
  'au2.sourceAi': 'AI',
  'au2.colSource': 'Source',
  'au2.colTab': 'Tab',
  'au2.colPolicy': 'Policy',
  'au2.out.allowed': 'Allowed',
  'au2.out.blocked': 'Blocked',
  'au2.out.cancelled': 'Cancelled',
  'au2.srcGlobal': 'global',
  'au2.srcHost': 'host',
  'au2.srcTemp': 'temp',
  'au2.capped': 'capped by {by}',
"""

if "'au2.colPolicy'" in text:
    raise SystemExit("i18n already has au2.colPolicy")
if zh_anchor not in text or en_anchor not in text:
    raise SystemExit("i18n anchors missing")
text = text.replace(zh_anchor, zh_insert, 1).replace(en_anchor, en_insert, 1)
i18n.write_text(text, encoding="utf-8", newline="\n")
print("i18n ok")

css = Path("src/renderer/src/features.css")
c = css.read_text(encoding="utf-8")
marker = ".au2-count { margin-left: auto; white-space: nowrap; }"
extra = marker + """
.au2-chip { display: inline-flex; align-items: center; flex: none; padding: 0 6px; height: 20px; border-radius: 999px; background: var(--color-bg-muted, var(--bg-muted)); color: var(--color-text-secondary, var(--muted)); font-size: 11px; font-variant-numeric: tabular-nums; }
.au2-chip.is-ai, .au2-src.is-ai { background: color-mix(in srgb, var(--accent, #3b82f6) 18%, transparent); color: var(--accent, #3b82f6); }
.au2-outcome { font-weight: 600; }
.au2-outcome.is-allowed { color: var(--success, #16a34a); }
.au2-outcome.is-blocked { color: var(--danger, #dc2626); }
.au2-outcome.is-cancelled { color: var(--color-text-muted, var(--muted)); }
.audit-table td.au2-policy, .audit-table td.au2-detail { white-space: normal; overflow-wrap: anywhere; max-width: 320px; }
.audit-table th:nth-child(5), .audit-table td:nth-child(5) { width: 48px; }
@media (max-width: 1100px) {
  .audit-table th:nth-child(2), .audit-table td:nth-child(2) { display: none; }
}
"""
if ".au2-outcome.is-blocked" in c:
    raise SystemExit("css already patched")
if marker not in c:
    raise SystemExit("css marker missing")
css.write_text(c.replace(marker, extra, 1), encoding="utf-8", newline="\n")
print("css ok")
