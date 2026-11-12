from pathlib import Path
# screenshot harness menu actions / locale / how steps work
har = Path("scripts/screenshot-key-screens.mjs").read_text(encoding="utf-8")
for needle in ["toggleLanguage", "locale", "setLocale", "aiComposerPop", "expect", "narrow", "r31AiShots"]:
    print(needle, har.count(needle))

# find how steps are executed
i = har.find("op === 'menu'")
print("====menu op exec====")
print(har[i:i+600])

i = har.find("function runStep")
if i<0: i = har.find("async function applyStep")
if i<0: i = har.find("for (const step of")
print("====step runner====")
print(har[i:i+800] if i>=0 else "not found")

# look for eval steps with locale
i = har.find("toggleLanguage")
print("====toggleLanguage====")
print(har[max(0,i-100):i+300] if i>=0 else "none")

# AIPanel screenshot effect for ops - end of hooks file
hooks = Path("src/renderer/src/lib/screenshot-hooks.ts").read_text(encoding="utf-8")
print("====hooks tail====")
print(hooks[-1500:])
