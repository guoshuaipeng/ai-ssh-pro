from pathlib import Path
import os, re, json

# inventory API surface
hits=[]
for dp,dns,fns in os.walk('src'):
    dns[:]=[d for d in dns if d not in {'node_modules','target'}]
    for fn in fns:
        if not fn.endswith(('.ts','.tsx','.rs')): continue
        p=os.path.join(dp,fn)
        try: t=open(p,encoding='utf-8',errors='ignore').read()
        except: continue
        if 'inventory' not in t.lower(): continue
        for i,l in enumerate(t.splitlines(),1):
            if re.search(r'aiss\.inventory|inventory\s*:|尚未接线|HostProfile|inventory\.(get|list|set|save|load)', l, re.I):
                hits.append(f'{p}:{i}:{l.strip()[:180]}')
print('=== inventory hits ===')
print('\n'.join(hits[:120]))

# LayoutResizer full
print('=== LayoutResizer ===')
print(Path('src/renderer/src/components/LayoutResizer.tsx').read_text(encoding='utf-8'))

# AI configured check
print('=== aiConfigured ===')
for dp,dns,fns in os.walk('src/renderer'):
  for fn in fns:
    if not fn.endswith(('.ts','.tsx')): continue
    p=os.path.join(dp,fn)
    t=open(p,encoding='utf-8',errors='ignore').read()
    for i,l in enumerate(t.splitlines(),1):
      if 'aiConfigured' in l or 'needAi' in l or '打开 AI 设置' in l or 'isAiConfigured' in l:
        if 'aiConfigured' in l or 'isAiConfigured' in l or '打开 AI' in l:
          hits.append(f'{p}:{i}:{l.strip()[:160]}')
print('\n'.join([h for h in hits if 'aiConfigured' in h or 'isAiConfigured' in h or '打开 AI' in h][:40]))

# store ai again
for path in [r'C:\Users\user\AppData\Roaming\ai-ssh-pro\store.json', r'C:\Users\user\AppData\Roaming\ai-ssh-pro\ai-ssh-pro.json']:
    d=json.loads(Path(path).read_text(encoding='utf-8'))
    ai=d.get('ai')
    print('FILE', path, 'ai=', json.dumps(ai, ensure_ascii=False)[:800] if ai else None)
