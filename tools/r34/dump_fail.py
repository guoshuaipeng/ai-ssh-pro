from pathlib import Path
panel=Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
i=panel.find("op === 'aiFailureEvidence'")
print(panel[i-50:i+1200])
print('==== memory chip class ====')
j=panel.find('ai-memory-chip')
print(panel[j-200:j+450])
print('==== onSetTempPolicy usage in panel ====')
for needle in ['onSetTempPolicy','AI_POLICIES']:
    print(needle, panel.find(needle))