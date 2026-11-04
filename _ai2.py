from pathlib import Path
import os, re

# electron import in rust
for path in ['src-tauri/src/store.rs', 'src-tauri/src/lib.rs', 'src-tauri/src/secret.rs', 'src-tauri/src/crypto.rs']:
    p=Path(path)
    if not p.exists():
        continue
    t=p.read_text(encoding='utf-8')
    print('====', path, 'exists len', len(t.splitlines()))
    for i,l in enumerate(t.splitlines(),1):
        if re.search(r'electron|import|ai\b|decrypt|enc:v1|secret|providers|merge', l, re.I):
            if i < 400 or 'ai' in l.lower() or 'enc' in l.lower() or 'decrypt' in l.lower() or 'electron' in l.lower() or 'provider' in l.lower():
                print(f'{i}|{l[:180]}')

print('==== list tauri src ====')
print('\n'.join(str(p) for p in Path('src-tauri/src').glob('*.rs')))

print('==== hasUsableKey ====')
for dp,dns,fns in os.walk('src'):
  for fn in fns:
    if not fn.endswith(('.ts','.tsx')): continue
    p=os.path.join(dp,fn)
    t=open(p,encoding='utf-8',errors='ignore').read()
    if 'hasUsableKey' in t or 'function hasUsable' in t:
      for i,l in enumerate(t.splitlines(),1):
        if 'hasUsableKey' in l or 'usableKey' in l:
          print(f'{p}:{i}:{l.strip()[:200]}')
