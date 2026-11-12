from pathlib import Path
har = Path('scripts/screenshot-key-screens.mjs').read_text(encoding='utf-8')
# find scene definitions containing r33 or en-ask or locale
import re
for m in re.finditer(r"id:\s*['\"]r3[0-9][^'\"]*['\"]", har):
    start=max(0,m.start()-80); end=min(len(har), m.end()+400)
    print('---', m.group(0))
    print(har[start:end][:500])
    print()
print('==== locale op ====')
idx=har.find('locale')
print(har[max(0,idx-200):idx+500])