import json
from pathlib import Path

def mask(s):
    if not isinstance(s,str) or not s.strip(): return 'empty'
    s=s.strip()
    return s[:4]+'…'+s[-4:] if len(s)>8 else '****'

# re-read store.json ai fully
for p in [
 Path(r'C:\Users\user\AppData\Roaming\ai-ssh-pro\store.json'),
 Path(r'C:\Users\user\AppData\Roaming\ai-ssh-pro\ai-ssh-pro.json'),
]:
    d=json.loads(p.read_text(encoding='utf-8'))
    print('====', p)
    print('ai=', json.dumps(d.get('ai'), ensure_ascii=False)[:1500])

# also search Local com.aisspro
root=Path(r'C:\Users\user\AppData\Local\com.aisspro.app')
if root.exists():
    for f in root.rglob('*'):
        if f.is_file() and f.suffix in ('.json','.dat','.bin') or 'store' in f.name.lower():
            print('LOCALFILE', f, f.stat().st_size)
