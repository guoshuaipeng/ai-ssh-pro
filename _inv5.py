from pathlib import Path
inv=Path('src-tauri/src/inventory.rs').read_text(encoding='utf-8')
print(inv[:5000])
print('==== LEN', len(inv.splitlines()))
print('==== exports ====')
for i,l in enumerate(inv.splitlines(),1):
    if l.startswith('pub fn') or 'root' in l.lower() or 'export' in l.lower() or 'import' in l.lower() or 'data_dir' in l:
        print(f'{i}|{l}')
# electron inventory export
main=Path('src/main/index.ts').read_text(encoding='utf-8')
ml=main.splitlines()
for i,l in enumerate(ml):
    if 'inventory:export' in l or 'inventory:import' in l or 'inventory:getRoot' in l:
        print('\n'.join(f'{j+1}|{ml[j]}' for j in range(i, min(i+40,len(ml)))))
        print('---')
# ai configured detection in App
app=Path('src/renderer/src/App.tsx').read_text(encoding='utf-8')
al=app.splitlines()
for i,l in enumerate(al):
    if 'setAiConfigured' in l:
        print(f'{i+1}|{l}')
        print('\n'.join(f'{j+1}|{al[j]}' for j in range(max(0,i-15), min(len(al),i+25))))
        print('---')
