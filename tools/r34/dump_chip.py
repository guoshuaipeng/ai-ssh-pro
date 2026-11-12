from pathlib import Path
panel = Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
# find safety chip render block
for needle in ['ai-safety-chip', 'policy.chip', 'data-chip-short', 'safety-band', 'setTempPolicy', 'tempPolicy', 'aiPolicy.effective']:
    idxs=[]
    start=0
    while True:
        i=panel.find(needle,start)
        if i<0: break
        idxs.append(i); start=i+1
    print(needle, idxs[:8])

# print chip JSX around first ai-safety-chip
i=panel.find('data-testid="ai-safety-chip"')
print('---CHIP---')
print(panel[i-400:i+900])
print('---policyChipTitle---')
i=panel.find('policyChipTitle')
print(panel[i-200:i+500])