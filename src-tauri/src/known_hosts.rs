use base64::{engine::general_purpose::STANDARD as B64, Engine};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnownHostEntry {
    pub host_port: String,
    pub fingerprint: String,
    pub host_key_base64: String,
    pub trusted_at: i64,
}

#[derive(Debug, Clone)]
pub enum HostKeyCheck {
    Trusted,
    Unknown { fingerprint: String },
    Changed { fingerprint: String, previous_fingerprint: String },
}

pub struct KnownHostsStore {
    path: PathBuf,
    entries: Mutex<HashMap<String, KnownHostEntry>>,
}

impl KnownHostsStore {
    pub fn load() -> Self {
        let dir = crate::store::data_dir();
        let path = dir.join("known-hosts.json");
        let mut entries = match fs::read_to_string(&path) {
            Ok(s) => serde_json::from_str::<Value>(&s)
                .ok()
                .and_then(|v| v.get("entries").cloned())
                .and_then(|e| serde_json::from_value::<HashMap<String, KnownHostEntry>>(e).ok())
                .unwrap_or_default(),
            Err(_) => HashMap::new(),
        };
        // First launch: Electron wrote ai-ssh-pro-known-hosts.json in the same folder.
        if entries.is_empty() {
            let epath = dir.join("ai-ssh-pro-known-hosts.json");
            if let Ok(s) = fs::read_to_string(&epath) {
                if let Ok(v) = serde_json::from_str::<Value>(&s) {
                    if let Some(ev) = v.get("entries").cloned() {
                        if let Ok(map) =
                            serde_json::from_value::<HashMap<String, KnownHostEntry>>(ev)
                        {
                            for (k, val) in map {
                                entries.insert(k.to_lowercase(), val);
                            }
                            let _ = fs::create_dir_all(
                                path.parent().unwrap_or(std::path::Path::new(".")),
                            );
                            let out = json!({ "entries": entries });
                            if let Ok(txt) = serde_json::to_string_pretty(&out) {
                                let _ = fs::write(&path, txt);
                            }
                            eprintln!(
                                "[ai-ssh-pro] auto-imported {} known hosts from {}",
                                entries.len(),
                                epath.display()
                            );
                        }
                    }
                }
            }
        }
        Self {
            path,
            entries: Mutex::new(entries),
        }
    }

    fn persist(&self, entries: &HashMap<String, KnownHostEntry>) {
        let _ = fs::create_dir_all(self.path.parent().unwrap_or(std::path::Path::new(".")));
        let v = json!({ "entries": entries });
        if let Ok(s) = serde_json::to_string_pretty(&v) {
            let _ = fs::write(&self.path, s);
        }
    }

    pub fn host_port_key(host: &str, port: u16) -> String {
        format!("{}:{}", host.trim().to_lowercase(), port)
    }

    pub fn fingerprint_sha256(host_key: &[u8]) -> String {
        let dig = Sha256::digest(host_key);
        format!("SHA256:{}", B64.encode(dig))
    }

    pub fn check(&self, host: &str, port: u16, host_key: &[u8]) -> HostKeyCheck {
        let fp = Self::fingerprint_sha256(host_key);
        let key = Self::host_port_key(host, port);
        let b64 = B64.encode(host_key);
        let entries = self.entries.lock();
        match entries.get(&key) {
            None => HostKeyCheck::Unknown { fingerprint: fp },
            Some(e) if e.host_key_base64 == b64 => HostKeyCheck::Trusted,
            Some(e) => HostKeyCheck::Changed {
                fingerprint: fp,
                previous_fingerprint: e.fingerprint.clone(),
            },
        }
    }

    pub fn trust(&self, host: &str, port: u16, host_key: &[u8]) -> KnownHostEntry {
        let key = Self::host_port_key(host, port);
        let entry = KnownHostEntry {
            host_port: key.clone(),
            fingerprint: Self::fingerprint_sha256(host_key),
            host_key_base64: B64.encode(host_key),
            trusted_at: chrono::Utc::now().timestamp_millis(),
        };
        let mut entries = self.entries.lock();
        entries.insert(key, entry.clone());
        self.persist(&entries);
        entry
    }

    pub fn trust_base64(&self, host: &str, port: u16, host_key_base64: &str) -> Result<KnownHostEntry, String> {
        let bytes = B64.decode(host_key_base64).map_err(|e| e.to_string())?;
        Ok(self.trust(host, port, &bytes))
    }

    pub fn list(&self) -> Vec<KnownHostEntry> {
        let mut v: Vec<_> = self.entries.lock().values().cloned().collect();
        v.sort_by(|a, b| a.host_port.cmp(&b.host_port));
        v
    }

    pub fn remove_by_key(&self, host_port: &str) -> bool {
        let key = host_port.trim().to_lowercase();
        let mut entries = self.entries.lock();
        if entries.remove(&key).is_some() {
            self.persist(&entries);
            true
        } else {
            false
        }
    }

    /// Import entries from Electron `ai-ssh-pro-known-hosts.json` shape.
    pub fn import_electron_map(&self, entries: &HashMap<String, KnownHostEntry>) -> usize {
        let mut n = 0;
        let mut map = self.entries.lock();
        for (k, v) in entries {
            map.insert(k.to_lowercase(), v.clone());
            n += 1;
        }
        self.persist(&map);
        n
    }
}

/// Encode ssh_key::PublicKey into the same wire bytes ssh2 stores.
pub fn public_key_wire_bytes(key: &russh::keys::PublicKey) -> Result<Vec<u8>, String> {
    use russh::keys::ssh_encoding::{Encode, Writer};
    struct Buf(Vec<u8>);
    impl Writer for Buf {
        fn write(&mut self, bytes: &[u8]) -> Result<(), russh::keys::ssh_encoding::Error> {
            self.0.extend_from_slice(bytes);
            Ok(())
        }
    }
    let mut buf = Buf(Vec::new());
    key.key_data()
        .encode(&mut buf)
        .map_err(|e| format!("encode public key: {e}"))?;
    Ok(buf.0)
}

pub fn algorithm_name(key: &russh::keys::PublicKey) -> String {
    key.algorithm().to_string()
}


/// Parse plain (non-hashed) OpenSSH known_hosts text into import preview rows.
pub fn build_import_preview(text: &str, source_path: Option<String>, store: &KnownHostsStore) -> Value {
    use serde_json::json;
    let existing = store.list();
    let mut rows = Vec::new();
    let mut skipped_hashed = 0usize;
    let mut skipped_other = 0usize;
    let mut hashed_samples: Vec<String> = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for raw_line in text.split('\n') {
        let line = raw_line.trim();
        if line.is_empty() {
            skipped_other += 1;
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        if line.starts_with('@') {
            skipped_other += 1;
            continue;
        }
        let bits: Vec<&str> = line.split_whitespace().collect();
        if bits.len() < 3 {
            skipped_other += 1;
            continue;
        }
        let names_field = bits[0];
        let key_type = bits[1];
        let host_key_b64 = bits[2];
        if names_field.starts_with('|')
            || names_field.split(',').any(|p| p.trim().starts_with('|'))
        {
            skipped_hashed += 1;
            if hashed_samples.len() < 8 {
                let sample = if line.chars().count() > 96 {
                    format!("{}…", line.chars().take(96).collect::<String>())
                } else {
                    line.to_string()
                };
                hashed_samples.push(sample);
            }
            continue;
        }
        if !host_key_b64
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '+' || c == '/' || c == '=')
            || host_key_b64.len() < 32
        {
            skipped_other += 1;
            continue;
        }
        for name_token in names_field.split(',') {
            let token = name_token.trim();
            if token.is_empty() {
                continue;
            }
            let (host, port) = parse_known_host_name(token);
            let dedupe = format!("{host}:{port}|{key_type}|{host_key_b64}");
            if !seen.insert(dedupe) {
                continue;
            }
            let host_port = format!("{}:{}", host.to_lowercase(), port);
            let existing_entry = existing.iter().find(|e| e.host_port == host_port);
            let action = match existing_entry {
                None => "add",
                Some(e) if e.host_key_base64 == host_key_b64 => "skip",
                Some(_) => "update",
            };
            let fingerprint = match B64.decode(host_key_b64) {
                Ok(bytes) => KnownHostsStore::fingerprint_sha256(&bytes),
                Err(_) => "SHA256:?".into(),
            };
            rows.push(json!({
                "host": host,
                "port": port,
                "keyType": key_type,
                "hostKeyBase64": host_key_b64,
                "action": action,
                "fingerprint": fingerprint,
                "selectedDefault": action == "add" || action == "update",
            }));
        }
    }

    json!({
        "rows": rows,
        "skippedHashed": skipped_hashed,
        "skippedOther": skipped_other,
        "skippedHashedSamples": hashed_samples,
        "sourcePath": source_path,
    })
}

fn parse_known_host_name(token: &str) -> (String, u16) {
    // [host]:port or host
    if let Some(rest) = token.strip_prefix('[') {
        if let Some(end) = rest.find(']') {
            let host = rest[..end].to_string();
            let port = rest[end + 1..]
                .strip_prefix(':')
                .and_then(|p| p.parse::<u16>().ok())
                .unwrap_or(22);
            return (host, port);
        }
    }
    if let Some((h, p)) = token.rsplit_once(':') {
        if let Ok(port) = p.parse::<u16>() {
            // avoid treating IPv6 without brackets as host:port wrongly — only if host has no other colons
            if !h.contains(':') {
                return (h.to_string(), port);
            }
        }
    }
    (token.to_string(), 22)
}
