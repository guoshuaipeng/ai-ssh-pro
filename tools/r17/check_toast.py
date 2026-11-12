from pathlib import Path
t = Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
print('showToast import/use', 'showToast' in t[:5000], t.find('showToast('))
# Is showToast a function in scope of the component?
print('function showToast', 'function showToast' in t or 'showToast =' in t or "from '../lib/toast'" in t or "from './Toast'" in t)
for line in t.splitlines():
    if 'showToast' in line and ('import' in line or 'from' in line):
        print('IMP', line)
