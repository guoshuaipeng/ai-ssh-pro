from pathlib import Path
app = Path("src/renderer/src/App.tsx").read_text(encoding="utf-8")
# find screenshot listener and locale handling; any early filter on detail.op
i = app.find("aiss-screenshot")
print("listeners", app.count("aiss-screenshot"))
print(app[i-80:i+200])
# find locale block
i = app.find("detail.op === 'locale'")
print("====locale====")
print(app[i-300:i+350])
# is there a switch/whitelist that might skip locale?
i = app.find("detail?.op")
# find the handler function start
i = app.find("addEventListener('aiss-screenshot'")
if i<0: i = app.find('addEventListener("aiss-screenshot"')
print("====listener start====")
print(app[i:i+800])
