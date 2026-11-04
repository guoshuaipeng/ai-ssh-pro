from pathlib import Path
import os
for dp,dns,fns in os.walk('src/renderer'):
  for fn in fns:
    if 'Resizer' in fn or 'resizer' in fn:
      print('FILE', os.path.join(dp,fn))
p=None
for dp,dns,fns in os.walk('src/renderer'):
  for fn in fns:
    if not fn.endswith(('.tsx','.ts')): continue
    path=os.path.join(dp,fn)
    t=open(path,encoding='utf-8',errors='ignore').read()
    if 'function LayoutResizer' in t or 'export function LayoutResizer' in t or 'const LayoutResizer' in t:
      print('DEF', path)
      print(t[t.find('LayoutResizer')-200:t.find('LayoutResizer')+800])
