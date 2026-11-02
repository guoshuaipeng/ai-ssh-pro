from pathlib import Path
print('==== hasUsableKey ====')
print(Path('src/shared/ai-presets.ts').read_text(encoding='utf-8')[130:220])
# secret crypto electron
print('==== secret-crypto ====')
print(Path('src/main/secret-crypto.ts').read_text(encoding='utf-8')[:2500])
print('==== ai.rs decrypt / settings ====')
t=Path('src-tauri/src/ai.rs').read_text(encoding='utf-8')
for i,l in enumerate(t.splitlines(),1):
    if any(x in l.lower() for x in ['decrypt','enc:','api_key','struct ai','fn chat','fn test','secret']):
        print(f'{i}|{l[:180]}')
print('==== inventory get_root ====')
inv=Path('src-tauri/src/inventory.rs').read_text(encoding='utf-8')
for i,l in enumerate(inv.splitlines(),1):
    if l.startswith('pub fn') or 'root' in l.lower() or 'fn root' in l:
        print(f'{i}|{l}')
print('==== inventory.rs first 120 ====')
print('\n'.join(inv.splitlines()[:120]))
