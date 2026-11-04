from pathlib import Path
import os,re

# where ui.154 is used
for dp,dns,fns in os.walk('src'):
  for fn in fns:
    if not fn.endswith(('.ts','.tsx')): continue
    p=os.path.join(dp,fn)
    t=open(p,encoding='utf-8',errors='ignore').read()
    if 'ui.154' in t or 'aiss.inventory' in t:
      for i,l in enumerate(t.splitlines(),1):
        if 'ui.154' in l or 'aiss.inventory' in l or 'window.aiss?.inventory' in l:
          print(f'{p}:{i}:{l.strip()[:200]}')

print('==== rust inventory ====')
for dp,dns,fns in os.walk('src-tauri'):
  for fn in fns:
    if not fn.endswith('.rs'): continue
    p=os.path.join(dp,fn)
    t=open(p,encoding='utf-8',errors='ignore').read()
    if 'inventory' in t.lower():
      for i,l in enumerate(t.splitlines(),1):
        if 'inventory' in l.lower():
          print(f'{p}:{i}:{l.strip()[:180]}')

print('==== HostInventoryModal check ====')
t=Path('src/renderer/src/components/HostInventoryModal.tsx').read_text(encoding='utf-8')
for i,l in enumerate(t.splitlines(),1):
  if 'inventory' in l or 'ui.154' in l or '尚未' in l:
    print(f'{i}|{l}')
