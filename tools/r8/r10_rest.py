from pathlib import Path

# --- lib.rs: add apply_cite_scrub command ---
lib = Path("src-tauri/src/lib.rs")
lt = lib.read_text(encoding="utf-8")
if "core_memory_apply_cite_scrub" not in lt:
    needle = """fn core_memory_recall(session_key: String, query: String, top_k: Option<usize>) -> Value {
    core_memory::recall_episodes(&session_key, &query, top_k)
}"""
    insert = needle + """

#[tauri::command]
fn core_memory_apply_cite_scrub(session_key: String, text: String) -> Value {
    core_memory::apply_cite_scrub(&session_key, &text)
}"""
    if needle not in lt:
        raise SystemExit("recall cmd missing")
    lt = lt.replace(needle, insert, 1)
    lt = lt.replace(
        "core_memory_recall,",
        "core_memory_recall,\n            core_memory_apply_cite_scrub,",
        1,
    )
    lib.write_text(lt, encoding="utf-8")
    print("lib scrub cmd added")
else:
    print("lib scrub already")

# --- bridge ---
br = Path("src/renderer/src/tauri-bridge.ts")
bt = br.read_text(encoding="utf-8")
if "applyCiteScrub" not in bt:
    bt = bt.replace(
        """      recall: (sessionKey: string, query: string, topK?: number) =>
        invoke('core_memory_recall', { sessionKey, query, topK: topK ?? null }),
    },""",
        """      recall: (sessionKey: string, query: string, topK?: number) =>
        invoke('core_memory_recall', { sessionKey, query, topK: topK ?? null }),
      applyCiteScrub: (sessionKey: string, text: string) =>
        invoke('core_memory_apply_cite_scrub', { sessionKey, text }),
    },""",
        1,
    )
    br.write_text(bt, encoding="utf-8")
    print("bridge applyCiteScrub")
else:
    print("bridge already")

# --- session_import hardening ---
si = Path("src-tauri/src/session_import.rs")
st = si.read_text(encoding="utf-8")
helper = '''
fn looks_encrypted_blob(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("encrypted")
        || lower.contains("cipher")
        || lower.contains("aes")
        || lower.contains("passwordhash")
        || lower.contains("masterpassword")
        || lower.contains("\"encrypt\"")
        || lower.contains("isencrypt")
        || text.contains("-----BEGIN PGP")
}

fn note_encrypted(base: &str, kind: &str, notes: &mut Vec<String>) {
    notes.push(format!(
        "{base}：检测到{kind}加密/受保护内容，本机导入不会解密口令或私钥密文；请导出为明文会话/OpenSSH config，或导入后手动填写认证信息"
    ));
}
'''
if "fn looks_encrypted_blob" not in st:
    # insert after parse_port
    anchor = "fn parse_port(raw: Option<&str>, fallback: u16) -> u16 {"
    i = st.find(anchor)
    if i < 0:
        raise SystemExit("parse_port missing")
    # find end of parse_port function
    j = st.find("\nfn ", i + 5)
    st = st[:j] + "\n" + helper + st[j:]
    print("helpers inserted")

# In import_session_files loop, after reading text, check encrypted
old_xsh = '''        if ext == "xsh" {
            if let Some(one) = parse_xsh(fp, &text) {
'''
new_xsh = '''        if ext == "xsh" {
            if looks_encrypted_blob(&text)
                || text.to_ascii_lowercase().contains("password=!")
                || text.to_ascii_lowercase().contains("encrypt=")
            {
                note_encrypted(&base, "Xshell", &mut notes);
            }
            if let Some(one) = parse_xsh(fp, &text) {
'''
if old_xsh in st and "检测到Xshell" not in st:
    st = st.replace(old_xsh, new_xsh, 1)
    print("xsh encrypt note")

old_moba = '''        if ext == "mxtsessions" || looks_like_moba(&text) {
            let drafts = parse_moba(&text);
'''
new_moba = '''        if ext == "mxtsessions" || looks_like_moba(&text) {
            if looks_encrypted_blob(&text) || text.contains("Prf\\\\") or False:
                pass
'''
# fix - write proper moba
new_moba = '''        if ext == "mxtsessions" || looks_like_moba(&text) {
            if looks_encrypted_blob(&text) {
                note_encrypted(&base, "MobaXterm", &mut notes);
            }
            let drafts = parse_moba(&text);
'''
if old_moba in st and "检测到MobaXterm" not in st:
    st = st.replace(old_moba, new_moba, 1)
    print("moba encrypt note")

old_fs = '''        if ext == "json" || looks_like_finalshell(&text) {
            let drafts = parse_finalshell(&text);
'''
# There may be two json/finalshell branches - only first with drafts
new_fs = '''        if ext == "json" || looks_like_finalshell(&text) {
            if looks_encrypted_blob(&text) || '"password":"' in text and 'ENC(' in text:
                pass
'''
# careful
if "检测到FinalShell" not in st:
    # find parse_finalshell call site
    needle = "let drafts = parse_finalshell(&text);"
    if needle in st:
        st = st.replace(
            needle,
            '''if looks_encrypted_blob(&text)
                || text.contains("ENC(")
                || text.to_ascii_lowercase().contains("\"encrypt\":true")
            {
                note_encrypted(&base, "FinalShell/JSON", &mut notes);
            }
            let drafts = parse_finalshell(&text);''',
            1,
        )
        print("finalshell encrypt note")

old_crt = '''        if looks_like_securecrt(&text) {
            if let Some(one) = parse_securecrt(stem, &text) {
'''
new_crt = '''        if looks_like_securecrt(&text) {
            if looks_encrypted_blob(&text) || text.to_ascii_lowercase().contains("v2password") {
                note_encrypted(&base, "SecureCRT", &mut notes);
            }
            if let Some(one) = parse_securecrt(stem, &text) {
'''
if old_crt in st and "检测到SecureCRT" not in st:
    st = st.replace(old_crt, new_crt, 1)
    print("securecrt encrypt note")

old_reg = '''        if ext == "reg" || looks_like_putty_reg(&text) {
            let (drafts, putty_notes) = parse_putty_reg(&text, &base);
'''
new_reg = '''        if ext == "reg" || looks_like_putty_reg(&text) {
            if text.to_ascii_lowercase().contains("publickeyfile") is False:
                pass
'''
new_reg = '''        if ext == "reg" || looks_like_putty_reg(&text) {
            if "ProxyPassword" in text or "\\Password\\" in text:
                notes.push(format!(
                    "{base}：PuTTY 导出可能含代理/会话口令字段；本机不会还原密文口令，请确认认证方式"
                ));
            let (drafts, putty_notes) = parse_putty_reg(&text, &base);
'''
# Fix invalid python-ish - write rust
new_reg = '''        if ext == "reg" || looks_like_putty_reg(&text) {
            if text.contains("ProxyPassword") || text.to_ascii_lowercase().contains("password\\\\") {
                notes.push(format!(
                    "{base}：PuTTY 导出可能含代理/会话口令字段；本机不会还原密文口令，请确认认证方式"
                ));
            }
            let (drafts, putty_notes) = parse_putty_reg(&text, &base);
'''
if old_reg in st and "PuTTY 导出可能含" not in st:
    st = st.replace(old_reg, new_reg, 1)
    print("putty password note")

# unknown format clearer
old_unk = '''        notes.push(format!(
            "{base}：非 .xsh / PuTTY，且未识别为 SSH config（需含 Host … 块）"
        ));'''
new_unk = '''        if looks_encrypted_blob(&text) {
            note_encrypted(&base, "未知私有", &mut notes);
        } else {
            notes.push(format!(
                "{base}：无法识别的会话格式（支持：Xshell .xsh / PuTTY .reg·会话 / MobaXterm .mxtsessions / SecureCRT / FinalShell JSON / OpenSSH config）。若为厂商加密库，请先在原软件导出明文或 OpenSSH config"
            ));
        }'''
if old_unk in st:
    st = st.replace(old_unk, new_unk, 1)
    print("unknown format note")

si.write_text(st, encoding="utf-8")
print("session_import done")
