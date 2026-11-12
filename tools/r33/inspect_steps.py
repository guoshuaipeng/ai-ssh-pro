from pathlib import Path
har = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
# find how shot.steps are executed
for needle in ["shot.steps", "steps:", "runShot", "async function capture", "for (const st", "detail.op", "await fire(win, step", "await fire(win, st"]:
    print(needle, har.count(needle))

# find the AI shot runner that maps matrix steps
i = har.find("r31AiShots()")
print("==== around r31 merge ====")
print(har[i-100:i+800])

# find generic step runner for object steps
i = har.find("if (step.op)")
if i<0: i = har.find("step?.op")
if i<0: i = har.find("typeof step ===")
print("==== step type handling ====")
# search more carefully
import re
for m in re.finditer(r"async function \w+|function \w+\(win", har):
    if "shot" in m.group().lower() or "step" in m.group().lower() or "prep" in m.group().lower() or "run" in m.group().lower():
        print(m.group(), "@", m.start())
