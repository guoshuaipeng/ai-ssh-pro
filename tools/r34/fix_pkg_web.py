from pathlib import Path
pkg = Path('package.json')
pt = pkg.read_text(encoding='utf-8')
old = 'npx tsx --tsconfig tsconfig.node.json scripts/test-r34-zh-en-policy-chip-contrast.ts'
new = 'npx tsx --tsconfig tsconfig.web.json scripts/test-r34-zh-en-policy-chip-contrast.ts'
if old in pt:
    pt = pt.replace(old, new, 1)
    pkg.write_text(pt, encoding='utf-8')
    print('pkg fixed to web')
elif new in pt:
    print('pkg already web')
else:
    print('WARN: r34 test string not found')