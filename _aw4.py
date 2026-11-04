from pathlib import Path
# App resizer snippet
app = Path('src/renderer/src/App.tsx').read_text(encoding='utf-8')
lines = app.splitlines()
for i,l in enumerate(lines):
    if 'layout-resizer' in l or 'layout-resizing' in l or 'clampSidebarWidth(p.sidebarWidth' in l:
        start=max(0,i-15); end=min(len(lines), i+25)
        print(f'---- around {i+1} ----')
        print('\n'.join(f'{j+1}|{lines[j]}' for j in range(start,end)))
        print()

# AlertWorkbench rest of JSX for rules panel
aw = Path('src/renderer/src/components/AlertWorkbenchTab.tsx').read_text(encoding='utf-8')
al = aw.splitlines()
print('==== AlertWorkbench imports/state top ====')
print('\n'.join(f'{i+1}|{al[i]}' for i in range(0,120)))
print('==== end JSX ====')
print('\n'.join(f'{i+1}|{al[i]}' for i in range(540, len(al))))

# AlertLine CSS grid
css=Path('src/renderer/src/features.css').read_text(encoding='utf-8')
cl=css.splitlines()
for i,l in enumerate(cl):
    if 'alert-line' in l:
        print(f'{i+1}:{l}')
