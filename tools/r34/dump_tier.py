from pathlib import Path
import re
# shared safety visibility / policy tier
for p in ['src/shared/safety-visibility.ts','src/shared/ai-policy.ts']:
    t=Path(p).read_text(encoding='utf-8')
    print('====', p)
    print(t[:2500])
    print('---')
# App temp policy
app=Path('src/renderer/src/App.tsx').read_text(encoding='utf-8')
for needle in ['tempPolicy','onSetTempPolicy','aiComposerPop','locale','setLocale']:
    print(needle, [m.start() for m in re.finditer(needle, app)][:6])
# print locale handler
i=app.find("detail.op === 'locale'")
print('LOCALE HANDLER', app[i-80:i+500])
# find how temp policy state lives
for m in re.finditer(r'tempPolicy', app):
    if m.start()>0:
        ctx=app[max(0,m.start()-60):m.start()+120]
        if 'useState' in ctx or 'setTemp' in ctx or 'tempPolicy=' in ctx or 'tempPolicy,' in ctx:
            print('CTX', ctx.replace('\n',' '))