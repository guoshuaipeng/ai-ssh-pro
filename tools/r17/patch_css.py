from pathlib import Path

# CSS for audit open-ai button + AI focus highlight
feat = Path('src/renderer/src/features.css')
ft = feat.read_text(encoding='utf-8')
if 'au2-open-ai' not in ft:
    ft += """
/* Round 17: audit row → AI dialog */
.audit-table td.au2-detail { display: flex; align-items: center; gap: 8px; }
.audit-table .au2-detail-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.audit-table .au2-open-ai {
  flex: 0 0 auto;
  border: 0;
  background: transparent;
  color: var(--color-accent);
  cursor: pointer;
  font-size: 12px;
  padding: 0 2px;
  white-space: nowrap;
}
.audit-table .au2-open-ai:hover { text-decoration: underline; }
"""
    feat.write_text(ft, encoding='utf-8')
    print('features.css ok')
else:
    print('features.css already')

styles = Path('src/renderer/src/styles.css')
st = styles.read_text(encoding='utf-8')
if 'is-audit-focus' not in st:
    st += """
/* Round 17: highlight AI card after jump-from-audit */
.ai-panel .ai-structured.is-audit-focus,
.ai-panel [data-testid="ai-reply-card"].is-audit-focus {
  outline: 2px solid color-mix(in srgb, var(--color-accent) 55%, transparent);
  outline-offset: 1px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-accent) 16%, transparent);
}
"""
    styles.write_text(st, encoding='utf-8')
    print('styles.css ok')
else:
    print('styles.css already')
