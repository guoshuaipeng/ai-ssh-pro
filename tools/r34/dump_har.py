from pathlib import Path
# inspect screenshot harness for locale/policy ops
for p in [
 'scripts/screenshot-key-screens.mjs',
 'src/renderer/src/lib/screenshot-hooks.ts',
 'package.json',
]:
    t=Path(p).read_text(encoding='utf-8')
    print('====', p, 'len', len(t))
# find r32/r33 scene defs and locale handling
har = Path('scripts/screenshot-key-screens.mjs').read_text(encoding='utf-8')
import re
for pat in ['r33-en', 'r32', 'locale', 'aiComposerPop', 'policy', 'chip', 'aiFailure', 'withMemory', 'aiMemory']:
    idxs=[m.start() for m in re.finditer(pat, har)]
    print(pat, 'count', len(idxs), 'first', idxs[:5])