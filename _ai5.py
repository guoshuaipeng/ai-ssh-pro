from pathlib import Path
t=Path('src/shared/ai-presets.ts').read_text(encoding='utf-8')
# print hasUsableKey function
idx=t.find('export function hasUsableKey')
print(t[idx:idx+600])
print('==== AIPanel load settings ====')
p=Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
pl=p.splitlines()
for i,l in enumerate(pl):
    if 'getSettings' in l or 'hasApiKey' in l or 'setHasApiKey' in l or '打开 AI' in l or 'needConfig' in l:
        print(f'{i+1}|{l[:160]}')
# check if there's any tauri secret decrypt attempt
import os
for dp,dns,fns in os.walk('src-tauri'):
  for fn in fns:
    p=os.path.join(dp,fn)
    t=open(p,encoding='utf-8',errors='ignore').read()
    if 'enc:v1' in t or 'safeStorage' in t or 'decrypt' in t.lower():
      print('FOUND', p)
      for i,l in enumerate(t.splitlines(),1):
        if 'enc' in l.lower() or 'decrypt' in l.lower() or 'safe' in l.lower():
          print(f'  {i}|{l[:160]}')
