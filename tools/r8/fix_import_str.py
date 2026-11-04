from pathlib import Path
si = Path("src-tauri/src/session_import.rs")
st = si.read_text(encoding="utf-8")
st = st.replace(
    '|| lower.contains(""encrypt"")',
    '|| lower.contains("\\\"encrypt\\\"")',
)
# better use simpler contains without escaped quotes in source
st = st.replace(
    '|| lower.contains("\\"encrypt\\"")',
    '|| lower.contains("encrypt")',
)
# fix the broken one that became weird
st = st.replace(
    '|| lower.contains(""encrypt"")',
    '|| lower.contains("encrypt")',
)
st = st.replace(
    '|| text.to_ascii_lowercase().contains(""encrypt":true")',
    '|| text.to_ascii_lowercase().contains("\\"encrypt\\":true")',
)
# If still broken from bad escapes, use a raw approach
import re
st = re.sub(
    r'lower\.contains\(""+encrypt""+\)',
    'lower.contains("encrypt")',
    st,
)
st = re.sub(
    r'text\.to_ascii_lowercase\(\)\.contains\(""+encrypt":true""+\)',
    'text.to_ascii_lowercase().contains("encrypt\\":true")',
    st,
)
# print lines still suspicious
for i,line in enumerate(st.splitlines(),1):
    if 'contains(""' in line or 'encrypt":true' in line:
        print("still", i, repr(line))

# SecureCRT note
if "检测到SecureCRT" not in st:
    old = '''        if looks_like_securecrt(&text) {
            let stem = fp.file_stem().and_then(|s| s.to_str()).unwrap_or("session");
            if let Some(one) = parse_securecrt(stem, &text) {'''
    new = '''        if looks_like_securecrt(&text) {
            let stem = fp.file_stem().and_then(|s| s.to_str()).unwrap_or("session");
            if looks_encrypted_blob(&text) || text.to_ascii_lowercase().contains("v2password") {
                note_encrypted(&base, "SecureCRT", &mut notes);
            }
            if let Some(one) = parse_securecrt(stem, &text) {'''
    if old in st:
        st = st.replace(old, new, 1)
        print("securecrt note added")
    else:
        print("securecrt block not matched")
        i = st.find("looks_like_securecrt")
        print(repr(st[i:i+200]))

si.write_text(st, encoding="utf-8")
# verify encrypt lines
for i,line in enumerate(st.splitlines(),1):
    if "encrypt" in line.lower() and "contains" in line:
        print(i, line.strip())
