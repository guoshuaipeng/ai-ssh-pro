from pathlib import Path

# --- AuditLogPanel: jump-to-AI button on AI rows ---
p = Path('src/renderer/src/components/AuditLogPanel.tsx')
t = p.read_text(encoding='utf-8')

if 'OPEN_AI_FROM_AUDIT_EVENT' not in t:
    old_imp = "import { openContextMenu } from './ContextMenu'\n"
    new_imp = (
        "import { openContextMenu } from './ContextMenu'\n"
        "import { OPEN_AI_FROM_AUDIT_EVENT, type OpenAiFromAuditDetail } from './ExecReplay'\n"
    )
    if old_imp not in t:
        raise SystemExit('import ContextMenu not found')
    t = t.replace(old_imp, new_imp, 1)

# Add helper + button in detail cell
old_detail = """                    <td className=\"au2-detail\" title={e.detail}>
                      {e.detail}
                    </td>"""
new_detail = """                    <td className=\"au2-detail\" title={e.detail}>
                      <span className=\"au2-detail-text\">{e.detail}</span>
                      {e.source === 'AI' && (e.type === 'command' || e.type === 'ai.action') ? (
                        <button
                          type=\"button\"
                          className=\"au2-open-ai\"
                          data-testid=\"audit-open-ai\"
                          title={t('au2.openAiTip')}
                          onClick={() => {
                            const detail: OpenAiFromAuditDetail = {
                              id: e.id,
                              host: e.host || undefined,
                              text: e.detail?.trim() || undefined,
                              tabNo: typeof e.tabNo === 'number' ? e.tabNo : undefined
                            }
                            window.dispatchEvent(new CustomEvent(OPEN_AI_FROM_AUDIT_EVENT, { detail }))
                          }}
                        >
                          {t('au2.openAi')}
                        </button>
                      ) : null}
                    </td>"""
if old_detail not in t:
    raise SystemExit('detail cell not found')
t = t.replace(old_detail, new_detail, 1)
p.write_text(t, encoding='utf-8')
print('AuditLogPanel ok')
