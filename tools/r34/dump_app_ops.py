from pathlib import Path
app=Path('src/renderer/src/App.tsx').read_text(encoding='utf-8')
# find the big if that lists AI shot ops
i=app.find("detail.op === 'aiMissToast'")
print(app[i-800:i+200])
print('====')
# AIPanel listener registration for new ops near aiMissToast
panel=Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
i=panel.find("detail?.op === 'aiMissToast'")
print(panel[i-400:i+200])
# find where aiMissToast is handled (body)
j=panel.find("op === 'aiMissToast'")
# all occurrences
start=0
while True:
    j=panel.find('aiMissToast', start)
    if j<0: break
    print('MISS@', j, panel[j-60:j+200].replace('\n',' ')[:220])
    start=j+1