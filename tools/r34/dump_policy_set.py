from pathlib import Path
har = Path('scripts/screenshot-key-screens.mjs').read_text(encoding='utf-8')
# find where shots are pushed
for needle in ['...r33AiShots', 'r33AiShots()', '...r31AiShots', 'r26AiShots()', 'aiFailureEvidence', 'withMemory']:
    i=0
    while True:
        j=har.find(needle,i)
        if j<0: break
        print('---', needle, j)
        print(har[max(0,j-80):j+280])
        i=j+1

panel = Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
# find temp policy setter for screenshot
for needle in ['screenshotPolicy', 'tempOverride', 'setAiPolicyTemp', 'policyOverride', "op === 'aiPolicy'", 'aiPolicyTemp', 'setTempAiPolicy', 'tempAiPolicy']:
    print(needle, panel.find(needle))

# how temp policy is applied
i=panel.find('tempPolicy')
print('tempPolicy first context:')
print(panel[i-100:i+400])
# find setTemp
for needle in ['setTemp', 'tempPolicy,', 'useState']:
    pass
import re
for m in re.finditer(r'const \[tempPolicy[^\]]+\]', panel):
    print(m.group(0))
for m in re.finditer(r'setTempPolicy\([^)]*\)', panel):
    print(m.group(0)[:120]); 
print('count setTempPolicy', panel.count('setTempPolicy'))