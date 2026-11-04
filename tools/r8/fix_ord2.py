from pathlib import Path
p = Path("src-tauri/src/core_memory.rs")
t = p.read_text(encoding="utf-8")
print("Ordering::equal count", t.count("Ordering::equal"))
t = t.replace("Ordering::equal", "Ordering::Equal")
# fix accidental double-backslashes in format! newlines from the python patch
# look for format!( with \\n as two chars backslash-n incorrectly doubled
bad = 'format!(\n                    "{}\\\\n{}",'
# search nearby
idx = t.find("scrub_cite_fillers(row.running_summary")
print("near scrub", repr(t[idx:idx+250]) if idx>=0 else None)
# Any occurrence of "{}\\n{}" as literal four-char \\n in source means `\n` escape - good.
# If we have `{}\\\\n{}` in the file content that's wrong (would print \n literally)
if "{}\\\\n{}" in t:
    t = t.replace("{}\\\\n{}", "{}\\n{}")
    print("fixed double escaped n")
elif "{}\\n{}" in t:
    print("format newline looks OK")
p.write_text(t, encoding="utf-8")
print("Ordering::Equal after", t.count("Ordering::equal"), "Equal", t.count("Ordering::Equal"))
