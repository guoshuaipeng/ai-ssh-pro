from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

(ROOT / "src-tauri/src/known_hosts_lookup.rs").write_text(r'''//! Resolve hashed OpenSSH known_hosts lines for one host via `ssh-keygen -F`.
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use crate::known_hosts::{build_import_preview, KnownHostsStore};

const CACHE_TTL: Duration = Duration::from_secs(60);

struct CacheEntry {
    result: Value,
    expires: Instant,
    mtime_ms: i64,
}

fn cache() -> &'static Mutex<HashMap<String, CacheEntry>> {
    static C: OnceLock<Mutex<HashMap<String, CacheEntry>>> = OnceLock::new();
    C.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn invalidate_cache() {
    if let Ok(mut g) = cache().lock() {
        g.clear();
    }
}

fn default_known_hosts_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ssh")
        .join("known_hosts")
}

fn is_safe_name(host: &str) -> bool {
    let h = host.trim();
    !h.is_empty()
        && h.len() <= 253
        && h.chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | ':' | '[' | ']'))
}

fn keygen_f_query_name(host: &str, port: u16) -> Option<String> {
    if !is_safe_name(host) {
        return None;
    }
    let h = host.trim().to_lowercase();
    let inner = h.trim_matches(|c| c == '[' || c == ']').to_string();
    if port == 22 {
        Some(inner)
    } else {
        Some(format!("[{inner}]:{port}"))
    }
}

fn file_mtime_ms(path: &PathBuf) -> i64 {
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(-1)
}

fn parse_ssh_keygen_f(stdout: &str, requested_host: &str, port: u16) -> Vec<Value> {
    let want = requested_host
        .trim()
        .to_lowercase()
        .trim_matches(|c| c == '[' || c == ']')
        .to_string();
    if want.is_empty() || !is_safe_name(&want) {
        return vec![];
    }
    let want_port = if port == 0 { 22 } else { port };
    let lines: Vec<&str> = stdout.split('\n').collect();
    let mut out = Vec::new();
    for i in 0..lines.len() {
        let line = lines[i].trim();
        let Some(caps) = line.strip_prefix("# Host ").and_then(|r| r.strip_suffix(" found:").or_else(|| {
            // "# Host xxx found:" case-insensitive-ish
            None
        })) else {
            // regex-like: # Host <name> found:
            let lower = line.to_ascii_lowercase();
            if !(lower.starts_with("# host ") && lower.contains(" found:")) {
                continue;
            }
            let mid = &line[7..];
            let Some(name_end) = mid.to_ascii_lowercase().find(" found:") else { continue };
            let named = mid[..name_end].trim();
            let (named_host, named_port) = if let Some(rest) = named.strip_prefix('[') {
                if let Some((h, p)) = rest.split_once("]:") {
                    (h.to_lowercase(), p.parse().unwrap_or(22))
                } else if let Some(h) = rest.strip_suffix(']') {
                    (h.to_lowercase(), 22)
                } else {
                    continue;
                }
            } else {
                (named.to_lowercase(), 22)
            };
            if named_host != want {
                continue;
            }
            if want_port != 22 && named_port != want_port {
                continue;
            }
            let mut body = String::new();
            for j in (i + 1)..lines.len() {
                let L = lines[j].trim();
                if L.is_empty() {
                    continue;
                }
                if L.starts_with('#') {
                    break;
                }
                body = L.to_string();
                break;
            }
            if body.is_empty() {
                continue;
            }
            let bits: Vec<&str> = body.split_whitespace().collect();
            if bits.len() < 3 {
                continue;
            }
            let names_field = bits[0];
            let key_type = bits[1];
            let host_key_b64 = bits[2];
            if host_key_b64.len() < 16
                || !host_key_b64
                    .chars()
                    .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
            {
                continue;
            }
            let hashed = names_field.starts_with('|')
                || names_field.split(',').any(|p| p.trim().starts_with('|'));
            let fp = match B64.decode(host_key_b64) {
                Ok(raw) => KnownHostsStore::fingerprint_sha256(&raw),
                Err(_) => "SHA256:?".into(),
            };
            let use_port = if want_port != 22 { want_port } else { named_port };
            let line_short = if body.len() > 120 {
                format!("{}…", &body[..120])
            } else {
                body.clone()
            };
            out.push(json!({
                "host": want,
                "port": use_port,
                "keyType": key_type,
                "hostKeyBase64": host_key_b64,
                "hashed": hashed,
                "line": line_short,
                "fingerprint": fp,
            }));
            continue;
        };
        let _ = caps;
    }
    // Fallback simpler parse if the strip_prefix path never ran — already handled in loop
    out
}

/// Parse with a more reliable scanner (primary).
fn parse_keygen_f_primary(stdout: &str, requested_host: &str, port: u16) -> Vec<Value> {
    let want = requested_host
        .trim()
        .to_lowercase()
        .trim_matches(|c| c == '[' || c == ']')
        .to_string();
    if want.is_empty() || !is_safe_name(&want) {
        return vec![];
    }
    let want_port = if port == 0 { 22 } else { port };
    let lines: Vec<&str> = stdout.lines().collect();
    let mut out = Vec::new();
    let mut i = 0;
    while i < lines.len() {
        let line = lines[i].trim();
        let lower = line.to_ascii_lowercase();
        if lower.starts_with("# host ") && lower.contains(" found:") {
            let mid = &line[7..];
            let Some(idx) = mid.to_ascii_lowercase().find(" found:") else {
                i += 1;
                continue;
            };
            let named = mid[..idx].trim();
            let (named_host, named_port) = if let Some(rest) = named.strip_prefix('[') {
                if let Some((h, p)) = rest.split_once("]:") {
                    (h.to_lowercase(), p.parse::<u16>().unwrap_or(22))
                } else if let Some(h) = rest.strip_suffix(']') {
                    (h.to_lowercase(), 22u16)
                } else {
                    i += 1;
                    continue;
                }
            } else {
                (named.to_lowercase(), 22u16)
            };
            if named_host != want {
                i += 1;
                continue;
            }
            if want_port != 22 && named_port != want_port {
                i += 1;
                continue;
            }
            let mut body = String::new();
            for j in (i + 1)..lines.len() {
                let L = lines[j].trim();
                if L.is_empty() {
                    continue;
                }
                if L.starts_with('#') {
                    break;
                }
                body = L.to_string();
                break;
            }
            if !body.is_empty() {
                let bits: Vec<&str> = body.split_whitespace().collect();
                if bits.len() >= 3 {
                    let names_field = bits[0];
                    let key_type = bits[1];
                    let host_key_b64 = bits[2];
                    if host_key_b64.len() >= 16
                        && host_key_b64
                            .chars()
                            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '+' | '/' | '='))
                    {
                        let hashed = names_field.starts_with('|')
                            || names_field.split(',').any(|p| p.trim().starts_with('|'));
                        let fp = match B64.decode(host_key_b64) {
                            Ok(raw) => KnownHostsStore::fingerprint_sha256(&raw),
                            Err(_) => "SHA256:?".into(),
                        };
                        let use_port = if want_port != 22 {
                            want_port
                        } else {
                            named_port
                        };
                        let line_short = if body.len() > 120 {
                            format!("{}…", &body[..120])
                        } else {
                            body.clone()
                        };
                        out.push(json!({
                            "host": want,
                            "port": use_port,
                            "keyType": key_type,
                            "hostKeyBase64": host_key_b64,
                            "hashed": hashed,
                            "line": line_short,
                            "fingerprint": fp,
                        }));
                    }
                }
            }
        }
        i += 1;
    }
    out
}

pub fn lookup_host(host: String, port: Option<u16>, file_path: Option<String>) -> Value {
    let port = port.unwrap_or(22);
    let Some(query) = keygen_f_query_name(&host, port) else {
        return json!({
            "ok": false,
            "query": host,
            "file": file_path.unwrap_or_default(),
            "matches": [],
            "error": "invalid host"
        });
    };
    let file = file_path
        .map(|s| PathBuf::from(s.trim()))
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(default_known_hosts_path);
    let file_s = file.to_string_lossy().to_string();
    if !file.exists() {
        invalidate_cache();
        return json!({
            "ok": false,
            "query": query,
            "file": file_s,
            "matches": [],
            "error": "known_hosts missing"
        });
    }
    let mtime = file_mtime_ms(&file);
    let cache_key = format!("{file_s}\0{query}");
    if let Ok(g) = cache().lock() {
        if let Some(hit) = g.get(&cache_key) {
            if hit.expires > Instant::now() && hit.mtime_ms == mtime {
                let mut v = hit.result.clone();
                if let Some(o) = v.as_object_mut() {
                    o.insert("cached".into(), json!(true));
                }
                return v;
            }
        }
    }

    let output = Command::new("ssh-keygen")
        .args(["-F", &query, "-f", &file_s])
        .output();
    let (code, stdout, stderr) = match output {
        Ok(o) => (
            o.status.code(),
            String::from_utf8_lossy(&o.stdout).to_string(),
            String::from_utf8_lossy(&o.stderr).to_string(),
        ),
        Err(e) => {
            let msg = e.to_string();
            let missing = msg.to_ascii_lowercase().contains("not found")
                || msg.contains("os error 2")
                || msg.contains("The system cannot find");
            return json!({
                "ok": false,
                "query": query,
                "file": file_s,
                "matches": [],
                "error": msg,
                "missingTool": missing
            });
        }
    };

    let mut matches = parse_keygen_f_primary(&stdout, &host, port);
    // attach previewRow when possible
    if !matches.is_empty() {
        let text = matches
            .iter()
            .filter_map(|m| {
                Some(format!(
                    "{} {} {}",
                    m.get("host")?.as_str()?,
                    m.get("keyType")?.as_str()?,
                    m.get("hostKeyBase64")?.as_str()?
                ))
            })
            .collect::<Vec<_>>()
            .join("\n");
        // build_import_preview needs a store — use empty store for action hints
        let store = KnownHostsStore::load();
        let preview = build_import_preview(&text, None, &store);
        let rows = preview
            .get("rows")
            .and_then(|r| r.as_array())
            .cloned()
            .unwrap_or_default();
        for m in matches.iter_mut() {
            let b64 = m
                .get("hostKeyBase64")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            if let Some(row) = rows.iter().find(|r| {
                r.get("hostKeyBase64")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    == b64
            }) {
                m.as_object_mut()
                    .unwrap()
                    .insert("previewRow".into(), row.clone());
            }
        }
    }

    let result = json!({
        "ok": true,
        "query": query,
        "file": file_s,
        "matches": matches,
        "error": if code == Some(1) { Value::Null } else if !stderr.trim().is_empty() && matches.is_empty() {
            json!(stderr.trim())
        } else {
            Value::Null
        }
    });
    if let Ok(mut g) = cache().lock() {
        g.insert(
            cache_key,
            CacheEntry {
                result: result.clone(),
                expires: Instant::now() + CACHE_TTL,
                mtime_ms: mtime,
            },
        );
    }
    let _ = SystemTime::now();
    result
}
'''.replace("fn parse_ssh_keygen_f(stdout: &str, requested_host: &str, port: u16) -> Vec<Value> {\n    let want = requested_host\n        .trim()\n        .to_lowercase()\n        .trim_matches(|c| c == '[' || c == ']')\n        .to_string();\n    if want.is_empty() || !is_safe_name(&want) {\n        return vec![];\n    }\n    let want_port = if port == 0 { 22 } else { port };\n    let lines: Vec<&str> = stdout.split('\\n').collect();\n    let mut out = Vec::new();\n    for i in 0..lines.len() {\n        let line = lines[i].trim();\n        let Some(caps) = line.strip_prefix(\"# Host \").and_then(|r| r.strip_suffix(\" found:\").or_else(|| {\n            // \"# Host xxx found:\" case-insensitive-ish\n            None\n        })) else {\n            // regex-like: # Host <name> found:\n            let lower = line.to_ascii_lowercase();\n            if !(lower.starts_with(\"# host \") && lower.contains(\" found:\")) {\n                continue;\n            }\n            let mid = &line[7..];\n            let Some(name_end) = mid.to_ascii_lowercase().find(\" found:\") else { continue };\n            let named = mid[..name_end].trim();\n            let (named_host, named_port) = if let Some(rest) = named.strip_prefix('[') {\n                if let Some((h, p)) = rest.split_once(\"]:\") {\n                    (h.to_lowercase(), p.parse().unwrap_or(22))\n                } else if let Some(h) = rest.strip_suffix(']') {\n                    (h.to_lowercase(), 22)\n                } else {\n                    continue;\n                }\n            } else {\n                (named.to_lowercase(), 22)\n            };\n            if named_host != want {\n                continue;\n            }\n            if want_port != 22 && named_port != want_port {\n                continue;\n            }\n            let mut body = String::new();\n            for j in (i + 1)..lines.len() {\n                let L = lines[j].trim();\n                if L.is_empty() {\n                    continue;\n                }\n                if L.starts_with('#') {\n                    break;\n                }\n                body = L.to_string();\n                break;\n            }\n            if body.is_empty() {\n                continue;\n            }\n            let bits: Vec<&str> = body.split_whitespace().collect();\n            if bits.len() < 3 {\n                continue;\n            }\n            let names_field = bits[0];\n            let key_type = bits[1];\n            let host_key_b64 = bits[2];\n            if host_key_b64.len() < 16\n                || !host_key_b64\n                    .chars()\n                    .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')\n            {\n                continue;\n            }\n            let hashed = names_field.starts_with('|')\n                || names_field.split(',').any(|p| p.trim().starts_with('|'));\n            let fp = match B64.decode(host_key_b64) {\n                Ok(raw) => KnownHostsStore::fingerprint_sha256(&raw),\n                Err(_) => \"SHA256:?\".into(),\n            };\n            let use_port = if want_port != 22 { want_port } else { named_port };\n            let line_short = if body.len() > 120 {\n                format!(\"{}…\", &body[..120])\n            } else {\n                body.clone()\n            };\n            out.push(json!({\n                \"host\": want,\n                \"port\": use_port,\n                \"keyType\": key_type,\n                \"hostKeyBase64\": host_key_b64,\n                \"hashed\": hashed,\n                \"line\": line_short,\n                \"fingerprint\": fp,\n            }));\n            continue;\n        };\n        let _ = caps;\n    }\n    // Fallback simpler parse if the strip_prefix path never ran — already handled in loop\n    out\n}\n\n", ""), encoding='utf-8')
print('known_hosts_lookup.rs', (ROOT/'src-tauri/src/known_hosts_lookup.rs').stat().st_size)