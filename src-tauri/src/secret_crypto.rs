//! Decrypt Electron `enc:v1:` secrets (Chromium OSCrypt / Windows DPAPI + AES-GCM).
use aes_gcm::{aead::{Aead, KeyInit}, Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

pub const SECRET_PREFIX: &str = "enc:v1:";

pub fn is_encrypted(value: &str) -> bool {
    value.starts_with(SECRET_PREFIX)
}

/// Decrypt a stored secret. Plaintext passes through. Unknown formats return the input unchanged
/// so the UI can still show "configured" while chat surfaces a clearer error later.
pub fn decrypt_secret(stored: &str) -> String {
    let stored = stored.trim();
    if stored.is_empty() || !is_encrypted(stored) {
        return stored.to_string();
    }
    match decrypt_electron_v1(stored) {
        Ok(plain) => plain,
        Err(e) => {
            eprintln!("[ai-ssh-pro] secret decrypt failed: {e}");
            stored.to_string()
        }
    }
}

fn decrypt_electron_v1(stored: &str) -> Result<String, String> {
    let b64 = &stored[SECRET_PREFIX.len()..];
    let cipher = B64.decode(b64).map_err(|e| format!("b64: {e}"))?;
    if cipher.len() < 3 + 12 + 16 || &cipher[..3] != b"v10" {
        return Err("unsupported OSCrypt payload (want v10)".into());
    }
    let key = load_os_crypt_key()?;
    let nonce = Nonce::from_slice(&cipher[3..15]);
    let ct = &cipher[15..];
    let gcm = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key));
    let plain = gcm
        .decrypt(nonce, ct)
        .map_err(|_| "AES-GCM decrypt failed (wrong OS user / Local State?)".to_string())?;
    String::from_utf8(plain).map_err(|e| e.to_string())
}

fn local_state_path() -> PathBuf {
    crate::store::data_dir().join("Local State")
}

fn load_os_crypt_key() -> Result<Vec<u8>, String> {
    #[cfg(not(windows))]
    {
        return Err("Electron enc:v1 decrypt is only implemented on Windows".into());
    }
    #[cfg(windows)]
    {
        let raw = fs::read_to_string(local_state_path()).map_err(|e| format!("Local State: {e}"))?;
        let v: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        let ek = v
            .pointer("/os_crypt/encrypted_key")
            .and_then(|x| x.as_str())
            .ok_or_else(|| "Local State missing os_crypt.encrypted_key".to_string())?;
        let blob = B64.decode(ek).map_err(|e| e.to_string())?;
        if blob.len() < 5 || &blob[..5] != b"DPAPI" {
            return Err("encrypted_key missing DPAPI prefix".into());
        }
        dpapi_unprotect(&blob[5..])
    }
}

#[cfg(windows)]
fn dpapi_unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    use std::ptr;

    #[repr(C)]
    struct DataBlob {
        cb_data: u32,
        pb_data: *mut u8,
    }

    extern "system" {
        fn CryptUnprotectData(
            p_data_in: *mut DataBlob,
            p_psz_data_descr: *mut *mut u16,
            p_optional_entropy: *mut DataBlob,
            p_reserved: *mut core::ffi::c_void,
            p_prompt_struct: *mut core::ffi::c_void,
            dw_flags: u32,
            p_data_out: *mut DataBlob,
        ) -> i32;
        fn LocalFree(h: *mut core::ffi::c_void) -> *mut core::ffi::c_void;
    }

    let mut input = DataBlob {
        cb_data: data.len() as u32,
        pb_data: data.as_ptr() as *mut u8,
    };
    let mut output = DataBlob {
        cb_data: 0,
        pb_data: ptr::null_mut(),
    };
    let ok = unsafe {
        CryptUnprotectData(
            &mut input,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
            0,
            &mut output,
        )
    };
    if ok == 0 {
        return Err("CryptUnprotectData failed".into());
    }
    let out = unsafe { std::slice::from_raw_parts(output.pb_data, output.cb_data as usize).to_vec() };
    unsafe {
        LocalFree(output.pb_data as *mut _);
    }
    Ok(out)
}

/// Decrypt every provider apiKey under an `ai` settings object (in place clone).
pub fn decrypt_ai_settings(mut ai: Value) -> Value {
    if let Some(arr) = ai.get_mut("providers").and_then(|v| v.as_array_mut()) {
        for p in arr {
            if let Some(k) = p.get("apiKey").and_then(|v| v.as_str()) {
                let plain = decrypt_secret(k);
                if let Some(obj) = p.as_object_mut() {
                    obj.insert("apiKey".into(), Value::String(plain));
                }
            }
        }
    }
    if let Some(k) = ai.get("apiKey").and_then(|v| v.as_str()).map(|s| s.to_string()) {
        if let Some(obj) = ai.as_object_mut() {
            obj.insert("apiKey".into(), Value::String(decrypt_secret(&k)));
        }
    }
    ai
}

pub fn ai_has_usable_key(ai: &Value) -> bool {
    if ai
        .get("apiKey")
        .and_then(|v| v.as_str())
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false)
    {
        return true;
    }
    ai.get("providers")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter().any(|p| {
                p.get("apiKey")
                    .and_then(|v| v.as_str())
                    .map(|s| !s.trim().is_empty())
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plaintext_passthrough() {
        assert_eq!(decrypt_secret("sk-test"), "sk-test");
        assert_eq!(decrypt_secret(""), "");
    }

    #[test]
    fn ai_has_usable_key_detects_provider() {
        let v = serde_json::json!({"providers":[{"id":"x","apiKey":"sk-1"}]});
        assert!(ai_has_usable_key(&v));
        let empty = serde_json::json!({"model":"qwen"});
        assert!(!ai_has_usable_key(&empty));
    }
}
