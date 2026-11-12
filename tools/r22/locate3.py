from pathlib import Path
lines = Path(r"src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8").splitlines()
for i in range(3305, 3345):
    print(f"{i+1}|{lines[i]}")
print("--- props ---")
for i in range(100, 130):
    print(f"{i+1}|{lines[i]}")
print("--- App focusPending ---")
app = Path(r"src/renderer/src/App.tsx").read_text(encoding="utf-8")
for needle in ["focusPendingToken", "setAiFocusPending", "aiFocusPending"]:
    idx=0
    n=0
    while n<6:
        i=app.find(needle, idx)
        if i<0: break
        line=app.count("\n",0,i)+1
        print(line, app[i:i+100].replace("\n"," / "))
        idx=i+len(needle); n+=1
