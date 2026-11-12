from pathlib import Path
har = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")

# how steps with op/eval are run for AI shots
for needle in ["async function fire", "function fire(", "step.op", "step.eval", "await page.evaluate", "__aissShot"]:
    i = 0
    c=0
    while True:
        j = har.find(needle, i)
        if j<0: break
        c+=1
        if c<=3:
            print(f"--- {needle} @{j} ---")
            print(har[j:j+500])
        i=j+1
    print(needle, "count", c)

# look at how r30 shots get merged
i = har.find("r30AiShots")
print("====r30 merge====")
print(har[i-200:i+500])
