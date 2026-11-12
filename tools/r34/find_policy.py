from pathlib import Path
root = Path('.')
needles = ['policy.ask','需确认','policyShort','chipShort','policy.short','仅建议','ai.policyShort','policyChipShort','policy.chip']
for p in root.rglob('*'):
    if p.suffix not in {'.ts','.tsx','.json','.js','.mjs'} or 'node_modules' in p.parts: continue
    try: t=p.read_text(encoding='utf-8')
    except Exception: continue
    if any(n in t for n in needles):
        print(str(p))