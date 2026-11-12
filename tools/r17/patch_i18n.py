from pathlib import Path

# --- i18n zh + en ---
p = Path('src/renderer/src/lib/i18n.tsx')
t = p.read_text(encoding='utf-8')

zh_anchor = "  'au2.capped': '受{by}限制',\n"
zh_add = zh_anchor + "  'au2.openAi': '对话',\n  'au2.openAiTip': '打开 AI 对话并定位到对应步骤',\n  'au2.openAiMiss': '未在当前对话找到该步骤',\n"
if "'au2.openAi'" not in t:
    if zh_anchor not in t:
        raise SystemExit('zh au2.capped not found')
    t = t.replace(zh_anchor, zh_add, 1)

en_anchor = "  'au2.capped': 'Capped by {by}',\n"
# find English capped - might differ
if "'au2.openAi':" not in t.split("'au2.capped': 'Capped")[0] if False else True:
    pass

# Find EN au2.capped
idx = t.find("  'au2.capped':", t.find("  'au2.capped':") + 1)
if idx < 0:
    raise SystemExit('en au2.capped not found')
# insert after that line
line_end = t.find('\n', idx)
en_line = t[idx:line_end+1]
if "'au2.openAi'" not in t[idx:idx+200]:
    insert = en_line + "  'au2.openAi': 'Chat',\n  'au2.openAiTip': 'Open AI chat focused on this step',\n  'au2.openAiMiss': 'Step not found in the current chat',\n"
    t = t[:idx] + insert + t[line_end+1:]

# Also need toast key used from App - already au2.openAiMiss

# Count zh+en
assert t.count("'au2.openAi':") == 2, t.count("'au2.openAi':")
assert t.count("'au2.openAiTip':") == 2
assert t.count("'au2.openAiMiss':") == 2
p.write_text(t, encoding='utf-8')
print('i18n ok')
