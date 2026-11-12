from pathlib import Path
panel=Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
i=panel.find("detail?.op === 'aiFailureEvidence'")
# find the actual handler that seeds failure - search for withMemory
j=panel.find('withMemory')
print('withMemory contexts:')
start=0
while True:
    j=panel.find('withMemory', start)
    if j<0: break
    print('---', j)
    print(panel[j-150:j+350])
    start=j+1