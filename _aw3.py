from pathlib import Path
import os,re
# find sidebar drag implementation
for path in [
 'src/renderer/src/App.tsx',
 'src/renderer/src/components',
]:
    pass
pat=re.compile(r'sidebarWidth|onSidebarResize|layout-prefs|col-resize|is-resizing|startResize')
for dp,dns,fns in os.walk('src/renderer'):
    for fn in fns:
        if not fn.endswith(('.tsx','.ts','.css')): continue
        p=os.path.join(dp,fn)
        t=open(p,encoding='utf-8',errors='ignore').read()
        if 'sidebarWidth' in t or 'layout-prefs' in t or 'startResize' in t or 'drag-handle' in t:
            for i,line in enumerate(t.splitlines(),1):
                if any(x in line for x in ('sidebarWidth','layout-prefs','startResize','drag-handle','col-resize','is-resizing','resizeHandle')):
                    print(f'{p}:{i}:{line.strip()[:180]}')
