from pathlib import Path
har = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
# Is the shots array built in a template string for a child process, or live?
i = har.find("r33AiShots()")
print(har[i-400:i+500])
print("====")
# find backtick start of this template
# look for const shots = or similar
i2 = har.rfind("`", 0, i)
i3 = har.rfind("const", 0, i)
print("prev const", har[i3:i3+80])
print("context around array start")
j = har.find("Round 33:")
print(har[j-200:j+400])
