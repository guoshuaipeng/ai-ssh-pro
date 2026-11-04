from pathlib import Path
import json, re

# deeper AI key scan
for path in [
    Path(r'C:\Users\user\AppData\Roaming\ai-ssh-pro\store.json'),
    Path(r'C:\Users\user\AppData\Roaming\ai-ssh-pro\ai-ssh-pro.json'),
]:
    data = json.loads(path.read_text(encoding='utf-8'))
    ai = data.get('ai') or {}
    print('====', path.name)
    print(json.dumps(ai, ensure_ascii=False)[:2000])
    # also search any apiKey anywhere
    def walk(o, p=''):
        if isinstance(o, dict):
            for k,v in o.items():
                if 'apikey' in k.lower() or k.lower() in ('key','token'):
                    s = v if isinstance(v,str) else str(v)
                    s = s.strip()
                    m = 'empty' if not s else (s[:4]+'…'+s[-4:] if len(s)>8 else '****')
                    print(f'  KEY at {p}.{k} = {m}')
                else:
                    walk(v, p+'.'+k)
        elif isinstance(o, list):
            for i,v in enumerate(o[:50]):
                walk(v, f'{p}[{i}]')
    walk(data)

t = Path('src/renderer/src/components/AlertWorkbenchTab.tsx').read_text(encoding='utf-8')
print('==== AlertWorkbenchTab length', len(t.splitlines()))
# print layout section around l2-body
for i,line in enumerate(t.splitlines(),1):
    if 'l2-' in line or 'listWidth' or 'narrow' in line.lower() or 'splitter' in line.lower() or 'width' in line.lower():
        pass
# better: extract lines 250-450
lines=t.splitlines()
print('\n'.join(f'{i+1}|{lines[i]}' for i in range(250, min(450,len(lines)))))
