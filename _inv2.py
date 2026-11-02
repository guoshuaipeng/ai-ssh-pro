from pathlib import Path

# tauri bridge inventory stub
t=Path('src/renderer/src/tauri-bridge.ts').read_text(encoding='utf-8')
lines=t.splitlines()
for i,l in enumerate(lines):
    if 'inventory' in l.lower() or '尚未' in l or 'not wired' in l.lower() or 'notImplemented' in l or 'stub' in l.lower():
        print(f'{i+1}|{l}')
print('==== bridge inventory block ====')
# find inventory: { ... }
start=None
for i,l in enumerate(lines):
    if re_match:=__import__('re').search(r'^\s*inventory\s*:', l):
        start=i; break
if start is not None:
    depth=0
    for i in range(start, min(start+80,len(lines))):
        print(f'{i+1}|{lines[i]}')
        depth += lines[i].count('{') - lines[i].count('}')
        if i>start and depth<=0: break

print('==== vite-env inventory ====')
v=Path('src/renderer/src/vite-env.d.ts').read_text(encoding='utf-8')
vl=v.splitlines()
for i,l in enumerate(vl):
    if 'inventory' in l:
        print(f'{i+1}|{l}')
        for j in range(i, min(i+40,len(vl))):
            print(f'{j+1}|{vl[j]}')
        break

print('==== preload inventory ====')
p=Path('src/preload/index.ts').read_text(encoding='utf-8')
pl=p.splitlines()
for i,l in enumerate(pl):
    if 'inventory:' in l and '{' in l:
        for j in range(i, min(i+30,len(pl))):
            print(f'{j+1}|{pl[j]}')
        break

# find inventory store impl
import os
for dp,dns,fns in os.walk('src'):
  for fn in fns:
    if 'inventory' in fn.lower():
      print('FILE', os.path.join(dp,fn))
