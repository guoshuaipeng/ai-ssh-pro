from pathlib import Path
app=Path('src/renderer/src/App.tsx').read_text(encoding='utf-8')
# print onSetTempPolicy wiring and screenshot listener for aiMissToast pattern
i=app.find('onSetTempPolicy=')
print(app[i:i+500])
print('==== aiMissToast handler ====')
i=app.find("detail.op === 'aiMissToast'")
print(app[i-100:i+400])
print('==== AIPanel tempPolicy apply ====')
panel=Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
# find where tempPolicy feeds resolve
i=panel.find('tempPolicy')
# find resolveAiPolicy call
j=panel.find('resolveAiPolicy(')
print(panel[j:j+600])
print('==== safetyOpen set from aiComposerPop ====')
k=panel.find("op === 'aiComposerPop'")
print(panel[k-80:k+500])