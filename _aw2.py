from pathlib import Path
# print features.css l2 section fully
css = Path('src/renderer/src/features.css').read_text(encoding='utf-8')
lines = css.splitlines()
# find l2-list and surrounding media queries
for i,l in enumerate(lines):
    if 'l2-list' in l or 'l2-body' in l or 'is-detail' in l or 'cqw' in l and 'l2' in l:
        print(f'{i+1}:{l}')

print('==== nearby block 1485-1605 ====')
print('\n'.join(f'{i+1}|{lines[i]}' for i in range(1484, min(1605,len(lines)))))

# find resize patterns
import os,re
pat=re.compile(r'onMouseDown.*width|setSidebarWidth|resize-handle|dragHandle|col-resize|localStorage.*[Ww]idth|persist.*width', re.I)
for dp,dns,fns in os.walk('src'):
    for fn in fns:
        if not fn.endswith(('.tsx','.ts','.css')): continue
        p=os.path.join(dp,fn)
        t=open(p,encoding='utf-8',errors='ignore').read()
        for i,line in enumerate(t.splitlines(),1):
            if pat.search(line) or 'col-resize' in line or 'resize-handle' in line or 'Splitter' in line:
                print(f'{p}:{i}:{line.strip()[:160]}')
