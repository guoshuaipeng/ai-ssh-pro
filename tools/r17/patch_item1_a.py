from pathlib import Path

p = Path('src/renderer/src/components/ExecReplay.tsx')
t = p.read_text(encoding='utf-8')
old = "export const OPEN_AUDIT_EVENT = 'aiss-open-audit'\n\nexport type OpenAuditDetail = {"
new = """export const OPEN_AUDIT_EVENT = 'aiss-open-audit'

/** Round 17: inverse of OPEN_AUDIT_EVENT — audit row → AI dialog step. */
export const OPEN_AI_FROM_AUDIT_EVENT = 'aiss-open-ai-from-audit'

export type OpenAiFromAuditDetail = {
  id?: string
  host?: string
  text?: string
  tabNo?: number
}

export type OpenAuditDetail = {"""
if old not in t:
    raise SystemExit('OPEN_AUDIT_EVENT block not found')
p.write_text(t.replace(old, new, 1), encoding='utf-8')
print('ExecReplay ok')
