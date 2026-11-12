from pathlib import Path
panel=Path('src/renderer/src/components/AIPanel.tsx').read_text(encoding='utf-8')
# find useEffect for screenshot event
i=panel.find('SCREENSHOT_EVENT')
print('count', panel.count('SCREENSHOT_EVENT'))
# find the useEffect that adds listener
idx=panel.find("addEventListener(SCREENSHOT_EVENT")
print(panel[idx-300:idx+200])
# deps of that effect?
# search backwards for useEffect
start=panel.rfind('useEffect', 0, idx)
print('EFFECT START', panel[start:start+150])
# find closing deps near end of this effect - look for ], [ after idx
end=panel.find('\n  }, [', idx)
print('DEPS CANDIDATE', panel[end:end+200])
# also check onSetTempPolicy in props destructure
j=panel.find('onSetTempPolicy')
print(panel[j-80:j+120])