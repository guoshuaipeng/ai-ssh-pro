from pathlib import Path
t=Path('src/renderer/src/components/HostInventoryModal.tsx').read_text(encoding='utf-8')
lines=t.splitlines()
print('\n'.join(f'{i+1}|{lines[i]}' for i in range(1,100)))
print('==== 700-770 ====')
print('\n'.join(f'{i+1}|{lines[i]}' for i in range(700, min(770,len(lines)))))

# How bridge installs - is inventory on window.aiss?
b=Path('src/renderer/src/tauri-bridge.ts').read_text(encoding='utf-8')
bl=b.splitlines()
print('==== bridge install end / window.aiss ====')
for i,l in enumerate(bl):
    if 'window.aiss' in l or 'Object.assign' in l or 'installTauriBridge' in l:
        print(f'{i+1}|{l}')
# print start of bridge api object construction
print('==== first 100 lines bridge ====')
print('\n'.join(f'{i+1}|{bl[i]}' for i in range(0,120)))
print('==== around 240-320 ====')
print('\n'.join(f'{i+1}|{bl[i]}' for i in range(230, min(340,len(bl)))))
