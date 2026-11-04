from pathlib import Path
p = Path("src-tauri/src/core_memory.rs")
raw = p.read_bytes()
# find the exact bytes around Ordering
text = raw.decode("utf-8")
for i, line in enumerate(text.splitlines(), 1):
    if "Ordering::" in line:
        print(i, repr(line))
# force replace lowercase equal
text2 = text.replace("Ordering::equal", "Ordering::Equal")
# The issue is my source and dest look the same in my head - use explicit
text2 = text.replace("::equal", "::" + "Equal")
# but that might break other things - only Ordering
import re
text2 = re.sub(r"Ordering::equal\b", "Ordering::Equal", text)
text2 = re.sub(r"Ordering::equal\b", "Ordering::Equal", text)
# EXPLICIT:
text2 = text.replace("std::cmp::Ordering::equal", "std::cmp::Ordering::Equal")
print("still wrong approach")
needle = "std::cmp::Ordering::" + "equal"
repl = "std::cmp::Ordering::" + "Equal"
# AARGH both look same. Use chr
bad = "std::cmp::Ordering::" + "e" + "qual"
good = "std::cmp::Ordering::" + "E" + "qual"
print("bad in text", bad in text, "good", good in text)
text2 = text.replace(bad, good)
print("after", bad in text2, good in text2, text2.count(good))
p.write_text(text2, encoding="utf-8")
