from pathlib import Path
app=Path('src/renderer/src/App.tsx').read_text(encoding='utf-8')
for needle in ['activeTabIdRef','activeTabId','setTempPolicyByTab']:
    print(needle, app.count(needle))
# find screenshot effect deps in App
i=app.find("detail.op === 'locale'")
# find the enclosing useEffect deps
end=app.find('\n  }, [', i)
print('DEPS near locale', app[end:end+250])
# is activeTabId in scope of that handler?
j=app.rfind('useEffect', 0, i)
print('effect start snippet', app[j:j+80])
# search activeTabIdRef definition
k=app.find('activeTabIdRef')
print('ref def', app[k:k+120] if k>=0 else 'NONE')
# how does setLocale work in same handler - state setters are fine from empty deps if using functional updates