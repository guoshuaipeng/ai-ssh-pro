from pathlib import Path
p = Path("src-tauri/src/local_fs.rs")
t = p.read_text(encoding="utf-8")
if "pub fn hash(" not in t:
    t += r'''

use sha2::{Digest, Sha256};

pub fn hash(target: String, max_bytes: Option<u64>) -> Result<String, String> {
    let max = max_bytes.unwrap_or(32 * 1024 * 1024);
    let path = PathBuf::from(target.trim());
    if !path.is_file() {
        return Err("not-a-file".into());
    }
    let mut file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    let mut buf = [0u8; 64 * 1024];
    let mut got: u64 = 0;
    use std::io::Read;
    loop {
        if got >= max {
            break;
        }
        let want = ((max - got) as usize).min(buf.len());
        let n = file.read(&mut buf[..want]).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        got += n as u64;
    }
    Ok(format!("{:x}", hasher.finalize()))
}

pub fn detect_key_kind(target: String) -> String {
    let path = PathBuf::from(target.trim());
    let text = fs::read_to_string(&path).unwrap_or_default();
    detect_key_material(&text)
}

pub fn detect_key_material(text: &str) -> String {
    if text.contains("sk-ssh-ed25519@openssh.com") || text.contains("sk-ed25519") {
        return "sk-ed25519".into();
    }
    if text.contains("ssh-ed25519-cert") || text.contains("ssh-ed25519") {
        return "ed25519".into();
    }
    if text.contains("ssh-rsa-cert") || text.contains("ssh-rsa") || text.contains("BEGIN RSA") {
        return "rsa".into();
    }
    if text.contains("ecdsa-sha2-") || text.contains("BEGIN EC") {
        return "ecdsa".into();
    }
    "unknown".into()
}
'''
    p.write_text(t, encoding="utf-8")
    print("local_fs hash/detect added")
else:
    print("hash already present")
