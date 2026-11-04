//! Session export / OpenSSH import helpers.
use serde_json::{json, Map, Value};
use std::collections::HashSet;

fn strip_secrets(profile: &Value) -> Value {
    let mut obj = match profile.as_object() {
        Some(o) => o.clone(),
        None => return profile.clone(),
    };
    obj.remove("password");
    obj.remove("passphrase");
    if let Some(jh) = obj.get("jumpHost").cloned() {
        if let Some(mut j) = jh.as_object().cloned() {
            j.remove("password");
            j.remove("passphrase");
            obj.insert("jumpHost".into(), Value::Object(j));
        }
    }
    if let Some(Value::Array(chain)) = obj.get("jumpChain").cloned() {
        let cleaned: Vec<Value> = chain
            .into_iter()
            .map(|hop| {
                let mut h = hop.as_object().cloned().unwrap_or_default();
                h.remove("password");
                h.remove("passphrase");
                Value::Object(h)
            })
            .collect();
        obj.insert("jumpChain".into(), Value::Array(cleaned));
    }
    Value::Object(obj)
}

pub fn export_sessions(state: &Value, format: &str) -> Result<String, String> {
    let folders = state.get("folders").cloned().unwrap_or(json!([]));
    let profiles = state
        .get("profiles")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if format == "openssh" {
        return Ok(export_openssh(&profiles));
    }
    let stripped: Vec<Value> = profiles.iter().map(strip_secrets).collect();
    let payload = json!({ "folders": folders, "profiles": stripped });
    Ok(format!(
        "{}\n",
        serde_json::to_string_pretty(&payload).map_err(|e| e.to_string())?
    ))
}

fn sanitize_alias(label: &str) -> String {
    let cleaned: String = label
        .trim()
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let cleaned = cleaned.trim_matches('-').to_string();
    if cleaned.is_empty() {
        "host".into()
    } else {
        cleaned
    }
}

fn unique_alias(label: &str, used: &mut HashSet<String>) -> String {
    let base = sanitize_alias(label);
    let mut name = base.clone();
    let mut n = 2;
    while used.contains(&name.to_ascii_lowercase()) {
        name = format!("{base}-{n}");
        n += 1;
    }
    used.insert(name.to_ascii_lowercase());
    name
}

fn export_openssh(profiles: &[Value]) -> String {
    let mut used = HashSet::new();
    let mut blocks = Vec::new();
    for p in profiles {
        let label = p
            .get("label")
            .and_then(|x| x.as_str())
            .or_else(|| p.get("host").and_then(|x| x.as_str()))
            .unwrap_or("host");
        let alias = unique_alias(label, &mut used);
        let host = p.get("host").and_then(|x| x.as_str()).unwrap_or("");
        let user = p.get("username").and_then(|x| x.as_str()).unwrap_or("root");
        let port = p.get("port").and_then(|x| x.as_u64()).unwrap_or(22);
        let mut lines = vec![
            format!("Host {alias}"),
            format!("  HostName {host}"),
            format!("  User {user}"),
        ];
        if port > 0 && port != 22 {
            lines.push(format!("  Port {port}"));
        }
        if let Some(key) = p.get("privateKeyPath").and_then(|x| x.as_str()) {
            let key = key.trim();
            if !key.is_empty() {
                let formatted = if key.chars().any(|c| c.is_whitespace() || c == '"' || c == '\'') {
                    format!("\"{}\"", key.replace('"', "\\\""))
                } else {
                    key.to_string()
                };
                lines.push(format!("  IdentityFile {formatted}"));
            }
        }
        // ProxyJump from jumpChain / jumpHost
        let mut hops: Vec<String> = Vec::new();
        if let Some(arr) = p.get("jumpChain").and_then(|x| x.as_array()) {
            for hop in arr {
                let h = hop.get("host").and_then(|x| x.as_str()).unwrap_or("");
                let u = hop.get("username").and_then(|x| x.as_str()).unwrap_or("");
                let pt = hop.get("port").and_then(|x| x.as_u64()).unwrap_or(22);
                if h.is_empty() || u.is_empty() {
                    continue;
                }
                if pt != 22 {
                    hops.push(format!("{u}@{h}:{pt}"));
                } else {
                    hops.push(format!("{u}@{h}"));
                }
            }
        } else if let Some(jh) = p.get("jumpHost") {
            let h = jh.get("host").and_then(|x| x.as_str()).unwrap_or("");
            let u = jh.get("username").and_then(|x| x.as_str()).unwrap_or("");
            let pt = jh.get("port").and_then(|x| x.as_u64()).unwrap_or(22);
            if !h.is_empty() && !u.is_empty() {
                if pt != 22 {
                    hops.push(format!("{u}@{h}:{pt}"));
                } else {
                    hops.push(format!("{u}@{h}"));
                }
            }
        }
        if !hops.is_empty() {
            lines.push(format!("  ProxyJump {}", hops.join(",")));
        }
        if let Some(fwds) = p.get("forwards").and_then(|x| x.as_array()) {
            for f in fwds {
                let lp = f.get("localPort").and_then(|x| x.as_u64()).unwrap_or(0);
                let rh = f.get("remoteHost").and_then(|x| x.as_str()).unwrap_or("");
                let rp = f.get("remotePort").and_then(|x| x.as_u64()).unwrap_or(0);
                if lp > 0 && !rh.is_empty() && rp > 0 {
                    lines.push(format!("  LocalForward {lp} {rh}:{rp}"));
                }
            }
        }
        blocks.push(lines.join("\n"));
    }
    if blocks.is_empty() {
        String::new()
    } else {
        format!("{}\n", blocks.join("\n\n"))
    }
}

/// Map ssh_config import profiles into ImportedSessionDraft-like items.
pub fn ssh_config_to_import_result(parsed: Value) -> Value {
    let profiles = parsed
        .get("profiles")
        .and_then(|x| x.as_array())
        .cloned()
        .unwrap_or_default();
    let warning = parsed.get("warning").and_then(|x| x.as_str());
    let mut notes = Vec::new();
    if let Some(w) = warning {
        notes.push(match w {
            "not-found" => format!(
                "未找到 {}。请用「导入会话」手动选择 OpenSSH config 文件。",
                parsed
                    .get("path")
                    .and_then(|x| x.as_str())
                    .unwrap_or("~/.ssh/config")
            ),
            other => other.to_string(),
        });
    }
    let items: Vec<Value> = profiles
        .into_iter()
        .map(|p| {
            let mut m = Map::new();
            m.insert(
                "label".into(),
                json!(p.get("label").and_then(|x| x.as_str()).unwrap_or("host")),
            );
            m.insert(
                "host".into(),
                json!(p.get("host").and_then(|x| x.as_str()).unwrap_or("")),
            );
            m.insert(
                "port".into(),
                json!(p.get("port").and_then(|x| x.as_u64()).unwrap_or(22)),
            );
            m.insert(
                "username".into(),
                json!(p
                    .get("username")
                    .and_then(|x| x.as_str())
                    .unwrap_or("root")),
            );
            if let Some(k) = p.get("privateKeyPath").and_then(|x| x.as_str()) {
                if !k.is_empty() {
                    m.insert("privateKeyPath".into(), json!(k));
                    m.insert("authType".into(), json!("privateKey"));
                }
            }
            if let Some(pj) = p.get("proxyJump").and_then(|x| x.as_str()) {
                if !pj.is_empty() {
                    m.insert("proxyJump".into(), json!(pj));
                }
            }
            m.insert("source".into(), json!("ssh-config"));
            Value::Object(m)
        })
        .collect();
    json!({ "items": items, "notes": notes, "warnings": notes })
}
