//! OpenSSH config parse + Include expansion (Electron shared/ssh-config-import).
use serde_json::{json, Value};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Clone, Default)]
struct HostBlock {
    patterns: Vec<String>,
    hostname: Option<String>,
    user: Option<String>,
    port: Option<u16>,
    identity_file: Option<String>,
    proxy_jump: Option<String>,
    local_forwards: Vec<String>,
}

fn expand_include(base: &Path, pattern: &str, depth: u32, out: &mut Vec<PathBuf>, seen: &mut HashSet<String>) {
    if depth > 6 {
        return;
    }
    let pat = pattern.trim().trim_matches('"');
    if pat.is_empty() {
        return;
    }
    let path = if Path::new(pat).is_absolute() {
        PathBuf::from(pat)
    } else {
        base.join(pat)
    };
    // simple glob: only * at end or plain file
    let s = path.to_string_lossy().to_string();
    if s.contains('*') {
        if let Some(parent) = path.parent() {
            let prefix = path
                .file_name()
                .map(|x| x.to_string_lossy().trim_end_matches('*').to_string())
                .unwrap_or_default();
            if let Ok(rd) = fs::read_dir(parent) {
                for e in rd.flatten() {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.starts_with(&prefix) || prefix.is_empty() {
                        let p = e.path();
                        let key = p.to_string_lossy().to_string();
                        if seen.insert(key) {
                            out.push(p.clone());
                            // nested Include inside file handled by caller
                        }
                    }
                }
            }
        }
    } else if path.is_file() {
        let key = path.to_string_lossy().to_string();
        if seen.insert(key) {
            out.push(path);
        }
    }
}

fn parse_file(path: &Path, depth: u32, blocks: &mut Vec<HostBlock>, seen: &mut HashSet<String>) {
    if depth > 8 {
        return;
    }
    let Ok(text) = fs::read_to_string(path) else {
        return;
    };
    let base = path.parent().unwrap_or(Path::new("."));
    let mut cur: Option<HostBlock> = None;
    for raw in text.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(key) = parts.next() else { continue };
        let key_l = key.to_ascii_lowercase();
        let rest = parts.collect::<Vec<_>>().join(" ");
        if key_l == "include" {
            let mut files = Vec::new();
            for pat in rest.split_whitespace() {
                expand_include(base, pat, depth + 1, &mut files, seen);
            }
            for f in files {
                parse_file(&f, depth + 1, blocks, seen);
            }
            continue;
        }
        if key_l == "host" {
            if let Some(b) = cur.take() {
                if !b.patterns.is_empty() {
                    blocks.push(b);
                }
            }
            let patterns: Vec<String> = rest
                .split_whitespace()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
                .collect();
            cur = Some(HostBlock {
                patterns,
                ..Default::default()
            });
            continue;
        }
        let Some(ref mut b) = cur else { continue };
        match key_l.as_str() {
            "hostname" => b.hostname = Some(rest.trim().to_string()),
            "user" => b.user = Some(rest.trim().to_string()),
            "port" => b.port = rest.trim().parse().ok(),
            "identityfile" => b.identity_file = Some(rest.trim().trim_matches('"').to_string()),
            "proxyjump" => b.proxy_jump = Some(rest.trim().to_string()),
            "localforward" => b.local_forwards.push(rest.trim().to_string()),
            _ => {}
        }
    }
    if let Some(b) = cur {
        if !b.patterns.is_empty() {
            blocks.push(b);
        }
    }
}

fn block_to_profile(b: &HostBlock) -> Option<Value> {
    let alias = b
        .patterns
        .iter()
        .find(|p| !p.contains('*') && !p.contains('?'))
        .cloned()
        .or_else(|| b.patterns.first().cloned())?;
    if alias.contains('*') || alias.contains('?') {
        return None;
    }
    let host = b.hostname.clone().unwrap_or_else(|| alias.clone());
    let id = format!(
        "sshcfg-{}",
        alias
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            })
            .collect::<String>()
    );
    Some(json!({
        "id": id,
        "label": alias,
        "host": host,
        "port": b.port.unwrap_or(22),
        "username": b.user.clone().unwrap_or_else(|| "root".into()),
        "authType": if b.identity_file.is_some() { "privateKey" } else { "password" },
        "privateKeyPath": b.identity_file,
        "proxyJump": b.proxy_jump,
        "localForwards": b.local_forwards,
        "source": "ssh-config",
    }))
}

pub fn default_ssh_config_path() -> PathBuf {
    if let Some(home) = dirs::home_dir() {
        return home.join(".ssh").join("config");
    }
    PathBuf::from(".ssh/config")
}

pub fn import_ssh_config(path: Option<&str>) -> Result<Value, String> {
    let p = match path {
        Some(s) if !s.trim().is_empty() => PathBuf::from(s.trim()),
        _ => default_ssh_config_path(),
    };
    if !p.is_file() {
        return Ok(json!({ "ok": true, "profiles": [], "path": p.to_string_lossy(), "warning": "not-found" }));
    }
    let mut blocks = Vec::new();
    let mut seen = HashSet::new();
    seen.insert(p.to_string_lossy().to_string());
    parse_file(&p, 0, &mut blocks, &mut seen);
    let mut profiles = Vec::new();
    let mut used = HashSet::new();
    for b in &blocks {
        if let Some(mut prof) = block_to_profile(b) {
            let id = prof.get("id").and_then(|x| x.as_str()).unwrap_or("").to_string();
            let mut final_id = id.clone();
            let mut n = 2;
            while !used.insert(final_id.clone()) {
                final_id = format!("{id}-{n}");
                n += 1;
            }
            if final_id != id {
                prof["id"] = json!(final_id);
            }
            profiles.push(prof);
        }
    }
    Ok(json!({
        "ok": true,
        "path": p.to_string_lossy(),
        "profiles": profiles,
        "count": profiles.len(),
    }))
}
