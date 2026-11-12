from pathlib import Path
p = Path("src/renderer/src/components/AIPanel.tsx").read_text(encoding="utf-8")
# find aiProdBanner / screenshot override handling for pattern
i = p.find("aiProdBanner")
print("==== first aiProdBanner contexts ====")
# find all
start=0
n=0
while n<6:
    i=p.find("aiProdBanner", start)
    if i<0: break
    print(f"--- @{i} ---")
    print(p[max(0,i-80):i+220].replace("\n"," | "))
    start=i+1
    n+=1

# screenshot effect entry
i = p.find("aiss-screenshot")
print("==== listener ====")
print(p[i-100:i+400])
