//! Third-party session import (Electron session-import + session-import-extra).
use serde_json::{json, Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use crate::sessions_io;
use crate::ssh_config;

fn decode_text_file(buf: &[u8]) -> String {
    if buf.len() >= 2 && buf[0] == 0xff && buf[1] == 0xfe {
        let u16s: Vec<u16> = buf[2..]
            .chunks(2)
            .filter_map(|c| {
                if c.len() == 2 {
                    Some(u16::from_le_bytes([c[0], c[1]]))
                } else {
                    None
                }
            })
            .collect();
        return String::from_utf16_lossy(&u16s);
    }
    if buf.len() >= 2 && buf[0] == 0xfe && buf[1] == 0xff {
        let u16s: Vec<u16> = buf[2..]
            .chunks(2)
            .filter_map(|c| {
                if c.len() == 2 {
                    Some(u16::from_be_bytes([c[0], c[1]]))
                } else {
                    None
                }
            })
            .collect();
        return String::from_utf16_lossy(&u16s);
    }
    let head = &buf[..buf.len().min(400)];
    let zero = head.iter().filter(|&&b| b == 0).count();
    if !head.is_empty() && zero * 5 > head.len() {
        let u16s: Vec<u16> = buf
            .chunks(2)
            .filter_map(|c| {
                if c.len() == 2 {
                    Some(u16::from_le_bytes([c[0], c[1]]))
                } else {
                    None
                }
            })
            .collect();
        return String::from_utf16_lossy(&u16s).trim_start_matches('\u{feff}').to_string();
    }
    String::from_utf8_lossy(buf)
        .trim_start_matches('\u{feff}')
        .to_string()
}

fn parse_ini_like(text: &str) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for raw in text.lines() {
        let line = raw
            .split(|c| c == '#' || c == ';')
            .next()
            .unwrap_or("")
            .trim();
        if line.is_empty() {
            continue;
        }
        let Some(eq) = line.find('=') else { continue };
        if eq == 0 {
            continue;
        }
        let key = line[..eq].trim().to_string();
        let val = line[eq + 1..].trim().to_string();
        if !key.is_empty() {
            out.insert(key, val);
        }
    }
    out
}

fn parse_port(raw: Option<&str>, fallback: u16) -> u16 {
    let Some(s) = raw else { return fallback };
    let cleaned: String = s.chars().filter(|c| !c.is_whitespace()).collect();
    cleaned
        .parse::<u16>()
        .ok()
        .filter(|&n| n > 0)
        .unwrap_or(fallback)
}


fn looks_encrypted_blob(text: &str) -> bool {
    let lower = text.to_ascii_lowercase();
    lower.contains("encrypted")
        || lower.contains("cipher")
        || lower.contains("aes")
        || lower.contains("passwordhash")
        || lower.contains("masterpassword")
        || lower.contains("encrypt")
        || lower.contains("isencrypt")
        || text.contains("-----BEGIN PGP")
}

fn note_encrypted(base: &str, kind: &str, notes: &mut Vec<String>) {
    notes.push(format!(
        "{base}：检测到{kind}加密/受保护内容，本机导入不会解密口令或私钥密文；请导出为明文会话/OpenSSH config，或导入后手动填写认证信息"
    ));
}

fn draft(label: &str, host: &str, port: u16, username: &str) -> Value {
    json!({
        "label": label.chars().take(80).collect::<String>(),
        "host": host,
        "port": port,
        "username": username,
    })
}

fn parse_xsh(path: &Path, text: &str) -> Option<Value> {
    let kv = parse_ini_like(text);
    let host = ["Host", "host", "HOST", "Address", "Connection Host", "RemoteHost", "HostName"]
        .iter()
        .find_map(|k| kv.get(*k).map(|s| s.as_str()))
        .filter(|s| !s.trim().is_empty())?
        .trim()
        .to_string();
    let port = parse_port(
        ["Port", "PortNumber", "port", "PORT"]
            .iter()
            .find_map(|k| kv.get(*k).map(|s| s.as_str())),
        22,
    );
    let username = ["UserName", "User", "username", "USER", "LoginName", "Connection User"]
        .iter()
        .find_map(|k| kv.get(*k).map(|s| s.as_str()))
        .filter(|s| !s.trim().is_empty())?
        .trim()
        .to_string();
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("session");
    let label = ["Name", "SessionName", "Label"]
        .iter()
        .find_map(|k| kv.get(*k).map(|s| s.trim().to_string()))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| stem.to_string());
    Some(draft(&label, &host, port, &username))
}

fn looks_like_moba(text: &str) -> bool {
    text.lines().any(|l| {
        let t = l.trim();
        t.starts_with('[') && t.to_ascii_lowercase().contains("bookmarks")
    }) && text.contains("#109#")
}

fn parse_moba(text: &str) -> Vec<Value> {
    let mut out = Vec::new();
    let mut in_bookmarks = false;
    let mut folder = String::new();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            let sec = &line[1..line.len() - 1];
            in_bookmarks = sec.to_ascii_lowercase().starts_with("bookmarks");
            folder.clear();
            continue;
        }
        if !in_bookmarks {
            continue;
        }
        let Some(eq) = line.find('=') else { continue };
        let key = line[..eq].trim();
        let value = line[eq + 1..].trim();
        if key.eq_ignore_ascii_case("subrep") {
            folder = value.replace('\\', "/");
            continue;
        }
        if key.eq_ignore_ascii_case("imgnum") {
            continue;
        }
        let parts: Vec<&str> = value.split('#').collect();
        if parts.len() < 3 || parts[1] != "109" {
            continue;
        }
        let f: Vec<&str> = parts[2].split('%').collect();
        let host = f.get(1).copied().unwrap_or("").trim();
        let port = f
            .get(2)
            .and_then(|p| p.parse::<u16>().ok())
            .filter(|&p| p > 0)
            .unwrap_or(22);
        let username = f.get(3).copied().unwrap_or("").trim();
        if host.is_empty() || username.is_empty() {
            continue;
        }
        let name = key.trim_start_matches(|c: char| c == '*' || c.is_whitespace());
        let name = if name.is_empty() {
            format!("{username}@{host}")
        } else {
            name.to_string()
        };
        let label = if folder.is_empty() {
            name
        } else {
            format!("{folder}/{name}")
        };
        out.push(draft(&label, host, port, username));
    }
    out
}

fn looks_like_securecrt(text: &str) -> bool {
    text.lines()
        .any(|l| l.trim().starts_with("S:\"Hostname\"=") || l.trim().starts_with("S:\"hostname\"="))
}

fn parse_securecrt(label: &str, text: &str) -> Option<Value> {
    let mut kv = HashMap::new();
    for raw in text.lines() {
        let line = raw.trim();
        // S:"Hostname"=...
        if line.len() < 5 {
            continue;
        }
        let kind = line.chars().next()?;
        if kind != 'S' && kind != 'D' && kind != 'B' {
            continue;
        }
        if !line[1..].starts_with(":\"") {
            continue;
        }
        let rest = &line[3..];
        let Some(end) = rest.find('"') else { continue };
        let key = rest[..end].to_ascii_lowercase();
        let after = &rest[end + 1..];
        if !after.starts_with('=') {
            continue;
        }
        kv.insert(format!("{kind}:{key}"), after[1..].trim().to_string());
    }
    let proto = kv
        .get("S:protocol name")
        .cloned()
        .unwrap_or_else(|| "SSH2".into());
    if !proto.to_ascii_lowercase().starts_with("ssh") {
        return None;
    }
    let host = kv.get("S:hostname")?.clone();
    let username = kv.get("S:username")?.clone();
    if host.is_empty() || username.is_empty() {
        return None;
    }
    let port = kv
        .get("D:[ssh2] port")
        .or_else(|| kv.get("D:port"))
        .and_then(|h| u16::from_str_radix(h, 16).ok())
        .filter(|&p| p > 0)
        .unwrap_or(22);
    let lab = if label.is_empty() {
        format!("{username}@{host}")
    } else {
        label.to_string()
    };
    Some(draft(&lab, &host, port, &username))
}

fn looks_like_finalshell(text: &str) -> bool {
    let t = text.trim();
    (t.starts_with('{') || t.starts_with('['))
        && t.contains("\"host\"")
        && (t.contains("\"user_name\"")
            || t.contains("\"userName\"")
            || t.contains("\"username\""))
}

fn str_field(o: &Map<String, Value>, keys: &[&str]) -> String {
    for k in keys {
        if let Some(v) = o.get(*k) {
            if let Some(s) = v.as_str() {
                if !s.trim().is_empty() {
                    return s.trim().to_string();
                }
            }
            if let Some(n) = v.as_i64() {
                return n.to_string();
            }
            if let Some(n) = v.as_u64() {
                return n.to_string();
            }
        }
    }
    String::new()
}

fn as_finalshell_records(data: &Value) -> Vec<&Map<String, Value>> {
    match data {
        Value::Array(arr) => arr.iter().filter_map(|x| x.as_object()).collect(),
        Value::Object(o) => {
            for key in ["connections", "hosts", "sessions", "items"] {
                if let Some(Value::Array(arr)) = o.get(key) {
                    return arr.iter().filter_map(|x| x.as_object()).collect();
                }
            }
            if o.get("host").and_then(|x| x.as_str()).is_some() {
                vec![o]
            } else {
                vec![]
            }
        }
        _ => vec![],
    }
}

fn parse_finalshell(text: &str) -> Vec<Value> {
    let Ok(data) = serde_json::from_str::<Value>(text) else {
        return vec![];
    };
    let mut out = Vec::new();
    for o in as_finalshell_records(&data) {
        let host = str_field(o, &["host", "hostname", "Host"]);
        let username = str_field(o, &["user_name", "userName", "username", "user"]);
        if host.is_empty() || username.is_empty() {
            continue;
        }
        let port_raw = str_field(o, &["port", "Port"]);
        let port = port_raw.parse::<u16>().ok().filter(|&p| p > 0).unwrap_or(22);
        let name = str_field(o, &["name", "label", "sessionName"]);
        let name = if name.is_empty() {
            format!("{username}@{host}")
        } else {
            name
        };
        let group = str_field(o, &["group", "folder", "parent", "groupName"]).replace('\\', "/");
        let password = str_field(o, &["password", "Password"]);
        let mut d = draft(&name, &host, port, &username);
        if let Some(obj) = d.as_object_mut() {
            if !group.is_empty() {
                obj.insert("group".into(), json!(group.chars().take(80).collect::<String>()));
            }
            if !password.is_empty() {
                obj.insert("password".into(), json!(password));
            }
        }
        out.push(d);
    }
    out
}

fn unwrap_quoted(v: &str) -> String {
    let t = v.trim();
    if t.len() >= 2
        && ((t.starts_with('"') && t.ends_with('"')) || (t.starts_with('\'') && t.ends_with('\'')))
    {
        t[1..t.len() - 1].to_string()
    } else {
        t.to_string()
    }
}

fn parse_reg_dword(raw: &str) -> Option<u16> {
    let t = raw.trim();
    if let Some(rest) = t.strip_prefix("dword:").or_else(|| t.strip_prefix("DWORD:")) {
        return u32::from_str_radix(rest, 16).ok().and_then(|n| u16::try_from(n).ok());
    }
    unwrap_quoted(t).parse().ok()
}

fn decode_putty_session_name(encoded: &str) -> String {
    // PuTTY encodes space as %20
    let mut out = String::new();
    let bytes = encoded.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(v) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                out.push(v as char);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

fn parse_reg_quoted_string(raw: &str) -> String {
    let t = raw.trim();
    if t.starts_with('"') {
        let mut s = String::new();
        let chars: Vec<char> = t.chars().collect();
        let mut i = 1;
        while i < chars.len() {
            if chars[i] == '"' {
                break;
            }
            if chars[i] == '\\' && i + 1 < chars.len() {
                s.push(chars[i + 1]);
                i += 2;
                continue;
            }
            s.push(chars[i]);
            i += 1;
        }
        s
    } else {
        t.to_string()
    }
}

fn draft_from_putty(
    label: &str,
    fields: &HashMap<String, String>,
    notes: &mut Vec<String>,
    source_hint: &str,
) -> Option<Value> {
    let protocol = unwrap_quoted(
        fields
            .get("Protocol")
            .or_else(|| fields.get("protocol"))
            .map(|s| s.as_str())
            .unwrap_or(""),
    )
    .to_ascii_lowercase();
    if !protocol.is_empty() && protocol != "ssh" {
        notes.push(format!("{source_hint}「{label}」：跳过非 SSH 协议（{protocol}）"));
        return None;
    }
    let host = unwrap_quoted(
        fields
            .get("HostName")
            .or_else(|| fields.get("hostname"))
            .or_else(|| fields.get("Host"))
            .map(|s| s.as_str())
            .unwrap_or(""),
    );
    if host.is_empty() {
        notes.push(format!("{source_hint}「{label}」：缺少 HostName"));
        return None;
    }
    let username = unwrap_quoted(
        fields
            .get("UserName")
            .or_else(|| fields.get("username"))
            .or_else(|| fields.get("User"))
            .map(|s| s.as_str())
            .unwrap_or(""),
    );
    let username = if username.is_empty() {
        "root".into()
    } else {
        username
    };
    let mut port = 22u16;
    if let Some(port_raw) = fields
        .get("PortNumber")
        .or_else(|| fields.get("Port"))
        .or_else(|| fields.get("port"))
    {
        if let Some(d) = parse_reg_dword(port_raw) {
            if d > 0 {
                port = d;
            }
        } else {
            port = parse_port(Some(&unwrap_quoted(port_raw)), 22);
        }
    }
    let mut d = draft(
        if label.trim().is_empty() { &host } else { label },
        &host,
        port,
        &username,
    );
    let public_key = unwrap_quoted(
        fields
            .get("PublicKeyFile")
            .or_else(|| fields.get("publickeyfile"))
            .or_else(|| fields.get("IdentityFile"))
            .map(|s| s.as_str())
            .unwrap_or(""),
    );
    if !public_key.is_empty() {
        if public_key.to_ascii_lowercase().ends_with(".ppk") {
            notes.push(format!(
                "{source_hint}「{label}」：检测到 .ppk 私钥路径，未导入（请转换为 OpenSSH 格式后手动指定）"
            ));
        } else if let Some(obj) = d.as_object_mut() {
            obj.insert("privateKeyPath".into(), json!(public_key));
            obj.insert("authMode".into(), json!("key"));
        }
    }
    Some(d)
}

fn looks_like_putty_reg(text: &str) -> bool {
    text.contains("\\PuTTY\\Sessions\\")
        || (text.to_ascii_lowercase().contains("windows registry editor")
            && text.to_ascii_lowercase().contains("putty"))
}

fn looks_like_putty_session_text(text: &str) -> bool {
    let has_host = text.lines().any(|l| {
        let t = l.trim();
        t.starts_with("\"HostName\"") || t.to_ascii_lowercase().starts_with("hostname")
    });
    let has_proto = text.lines().any(|l| {
        let t = l.trim();
        t.starts_with("\"Protocol\"") || t.to_ascii_lowercase().starts_with("protocol")
    });
    has_host && has_proto
}

fn parse_putty_reg(text: &str, source_hint: &str) -> (Vec<Value>, Vec<String>) {
    let mut drafts = Vec::new();
    let mut notes = Vec::new();
    let mut label: Option<String> = None;
    let mut fields: HashMap<String, String> = HashMap::new();
    let flush = |label: &mut Option<String>,
                 fields: &mut HashMap<String, String>,
                 drafts: &mut Vec<Value>,
                 notes: &mut Vec<String>| {
        if let Some(lab) = label.take() {
            if let Some(d) = draft_from_putty(&lab, fields, notes, source_hint) {
                drafts.push(d);
            }
            fields.clear();
        }
    };
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            let inner = &line[1..line.len() - 1];
            // [-]HKEY_...\\PuTTY\\Sessions\\Name
            if let Some(idx) = inner.to_ascii_lowercase().find("\\putty\\sessions\\") {
                flush(&mut label, &mut fields, &mut drafts, &mut notes);
                let encoded = &inner[idx + "\\putty\\sessions\\".len()..];
                let decoded = decode_putty_session_name(encoded.trim());
                if decoded.eq_ignore_ascii_case("Default Settings") {
                    label = None;
                    fields.clear();
                    continue;
                }
                label = Some(decoded);
                fields.clear();
            }
            continue;
        }
        if label.is_none() {
            continue;
        }
        // "Name"=value
        if !line.starts_with('"') {
            continue;
        }
        let Some(end) = line[1..].find('"') else { continue };
        let name = &line[1..1 + end];
        let rest = line[1 + end + 1..].trim();
        if !rest.starts_with('=') {
            continue;
        }
        let raw_val = rest[1..].trim();
        if raw_val.to_ascii_lowercase().starts_with("dword:") {
            fields.insert(name.to_string(), raw_val.to_string());
        } else {
            fields.insert(name.to_string(), parse_reg_quoted_string(raw_val));
        }
    }
    flush(&mut label, &mut fields, &mut drafts, &mut notes);
    (drafts, notes)
}

fn parse_putty_session_file(path: &Path, text: &str, notes: &mut Vec<String>) -> Option<Value> {
    let kv = parse_ini_like(text);
    let label = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("session");
    draft_from_putty(label, &kv, notes, path.file_name().and_then(|s| s.to_str()).unwrap_or("putty"))
}

fn merge_unique(items: Vec<Value>) -> Vec<Value> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    for it in items {
        let key = format!(
            "{}|{}|{}|{}",
            it.get("host").and_then(|x| x.as_str()).unwrap_or(""),
            it.get("port").and_then(|x| x.as_u64()).unwrap_or(22),
            it.get("username").and_then(|x| x.as_str()).unwrap_or(""),
            it.get("label").and_then(|x| x.as_str()).unwrap_or(""),
        )
        .to_ascii_lowercase();
        if seen.insert(key) {
            out.push(it);
        }
    }
    out
}

/// Import sessions from one or more file paths (Electron importSessionFilesFromPaths).
pub fn import_session_files(paths: &[PathBuf]) -> Value {
    let mut notes = Vec::new();
    let mut items = Vec::new();
    for fp in paths {
        let base = fp
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("file")
            .to_string();
        let ext = fp
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let buf = match fs::read(fp) {
            Ok(b) => b,
            Err(e) => {
                notes.push(format!("{base}：读取失败 {e}"));
                continue;
            }
        };
        let text = decode_text_file(&buf);

        if ext == "mxtsessions" || looks_like_moba(&text) {
            if looks_encrypted_blob(&text) {
                note_encrypted(&base, "MobaXterm", &mut notes);
            }
            let drafts = parse_moba(&text);
            if drafts.is_empty() {
                notes.push(format!("{base}：未解析到 MobaXterm SSH 书签"));
            } else {
                notes.push(format!("{base}：自 MobaXterm 书签解析 {} 条", drafts.len()));
                items.extend(drafts);
            }
            continue;
        }

        if ext == "json" || looks_like_finalshell(&text) {
            if looks_encrypted_blob(&text)
                || text.contains("ENC(")
                || text.to_ascii_lowercase().contains("\"encrypt\":true")
            {
                note_encrypted(&base, "FinalShell/JSON", &mut notes);
            }
            let drafts = parse_finalshell(&text);
            if !drafts.is_empty() {
                notes.push(format!("{base}：自 FinalShell 解析 {} 条", drafts.len()));
                items.extend(drafts);
                continue;
            }
            // app JSON export
            if let Ok(v) = serde_json::from_str::<Value>(&text) {
                if let Some(arr) = v.get("profiles").and_then(|x| x.as_array()) {
                    items.extend(arr.clone());
                    notes.push(format!("{base}：自 JSON profiles 解析 {} 条", arr.len()));
                    continue;
                }
            }
            if ext == "json" || looks_like_finalshell(&text) {
                notes.push(format!("{base}：未解析到 FinalShell / JSON SSH 连接"));
                continue;
            }
        }

        if looks_like_securecrt(&text) {
            let stem = fp.file_stem().and_then(|s| s.to_str()).unwrap_or("session");
            if looks_encrypted_blob(&text) || text.to_ascii_lowercase().contains("v2password") {
                note_encrypted(&base, "SecureCRT", &mut notes);
            }
            if let Some(one) = parse_securecrt(stem, &text) {
                items.push(one);
                notes.push(format!("{base}：自 SecureCRT 会话解析 1 条"));
            } else {
                notes.push(format!("{base}：SecureCRT 会话未识别到 SSH 主机 / 用户名"));
            }
            continue;
        }

        if ext == "xsh" {
            if looks_encrypted_blob(&text)
                || text.to_ascii_lowercase().contains("password=!")
                || text.to_ascii_lowercase().contains("encrypt=")
            {
                note_encrypted(&base, "Xshell", &mut notes);
            }
            if let Some(one) = parse_xsh(fp, &text) {
                items.push(one);
            } else {
                notes.push(format!("{base}：未识别到 Host / 用户名"));
            }
            continue;
        }

        if ext == "reg" || looks_like_putty_reg(&text) {
            if text.contains("ProxyPassword") || text.to_ascii_lowercase().contains("password") {
                // note: does not decrypt; user must re-enter secrets
                notes.push(format!(
                    "{base}：PuTTY 导出可能含代理/会话口令字段；本机不会还原密文口令，请确认认证方式"
                ));
            }
            let (drafts, putty_notes) = parse_putty_reg(&text, &base);
            notes.extend(putty_notes);
            if drafts.is_empty() {
                notes.push(format!("{base}：未解析到有效 PuTTY SSH 会话"));
            } else {
                notes.push(format!("{base}：自 PuTTY 注册表导出解析 {} 条", drafts.len()));
                items.extend(drafts);
            }
            continue;
        }

        let name_l = base.to_ascii_lowercase();
        if looks_like_putty_session_text(&text)
            || (name_l.contains("putty") && text.to_ascii_lowercase().contains("hostname"))
        {
            if let Some(one) = parse_putty_session_file(fp, &text, &mut notes) {
                items.push(one);
                notes.push(format!("{base}：自 PuTTY 会话文件解析 1 条"));
                continue;
            }
            if looks_like_putty_session_text(&text) {
                notes.push(format!("{base}：PuTTY 会话未识别到有效 SSH HostName"));
                continue;
            }
        }

        // OpenSSH config
        let looks_ssh = name_l == "config"
            || ext == "config"
            || text.lines().any(|l| l.trim().to_ascii_lowercase().starts_with("host "));
        if looks_ssh {
            match ssh_config::import_ssh_config(Some(fp.to_string_lossy().as_ref())) {
                Ok(parsed) => {
                    let mapped = sessions_io::ssh_config_to_import_result(parsed);
                    if let Some(arr) = mapped.get("items").and_then(|x| x.as_array()) {
                        if arr.is_empty() {
                            notes.push(format!("{base}：未解析到有效 Host 块"));
                        } else {
                            notes.push(format!("{base}：自 OpenSSH 配置解析 {} 条", arr.len()));
                            items.extend(arr.clone());
                        }
                    }
                }
                Err(e) => notes.push(format!("{base}：SSH config 解析失败 {e}")),
            }
            continue;
        }

        if looks_encrypted_blob(&text) {
            note_encrypted(&base, "未知私有", &mut notes);
        } else {
            notes.push(format!(
                "{base}：无法识别的会话格式（支持：Xshell .xsh / PuTTY .reg·会话 / MobaXterm .mxtsessions / SecureCRT / FinalShell JSON / OpenSSH config）。若为厂商加密库，请先在原软件导出明文或 OpenSSH config"
            ));
        }
    }
    let before = items.len();
    let merged = merge_unique(items);
    if merged.len() < before {
        notes.push(format!(
            "已去除同主机/端口/用户/标签的重复项 {} 条",
            before - merged.len()
        ));
    }
    json!({ "items": merged, "notes": notes, "warnings": notes })
}
