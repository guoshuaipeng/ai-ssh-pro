from pathlib import Path
import os, re, json

# App setAiConfigured
app = Path('src/renderer/src/App.tsx').read_text(encoding='utf-8')
al = app.splitlines()
for i,l in enumerate(al):
    if 'setAiConfigured' in l or 'aiConfigured' in l and ('getSettings' in l or 'apiKey' in l or 'activeProvider' in l or 'providers' in l):
        start=max(0,i-20); end=min(len(al),i+30)
        print(f'---- App {i+1} ----')
        print('\n'.join(f'{j+1}|{al[j]}' for j in range(start,end)))

# shared ai settings helpers
print('==== search isConfigured / hasApiKey ====')
for dp,dns,fns in os.walk('src'):
  dns[:]=[d for d in dns if d not in {'node_modules','target'}]
  for fn in fns:
    if not fn.endswith(('.ts','.tsx','.rs')): continue
    p=os.path.join(dp,fn)
    t=open(p,encoding='utf-8',errors='ignore').read()
    for i,l in enumerate(t.splitlines(),1):
      if re.search(r'isAiConfigured|aiIsReady|hasApiKey|decrypt.*apiKey|enc:v1|activeProviderId|providers.*apiKey', l):
        print(f'{p}:{i}:{l.strip()[:200]}')

print('==== store.json vs electron ai ====')
for path in [r'C:\Users\user\AppData\Roaming\ai-ssh-pro\store.json', r'C:\Users\user\AppData\Roaming\ai-ssh-pro\ai-ssh-pro.json']:
    d=json.loads(Path(path).read_text(encoding='utf-8'))
    print(path, 'ai=', json.dumps(d.get('ai'), ensure_ascii=False)[:500])

print('==== rust ai / decrypt ====')
for dp,dns,fns in os.walk('src-tauri/src'):
  for fn in fns:
    if not fn.endswith('.rs'): continue
    p=os.path.join(dp,fn)
    t=open(p,encoding='utf-8',errors='ignore').read()
    if any(x in t.lower() for x in ['apikey','decrypt','enc:v1','ai_chat','get_settings','active_provider']):
      for i,l in enumerate(t.splitlines(),1):
        if re.search(r'api_?key|decrypt|enc:v1|ai_chat|active_provider|providers', l, re.I):
          print(f'{p}:{i}:{l.strip()[:180]}')
