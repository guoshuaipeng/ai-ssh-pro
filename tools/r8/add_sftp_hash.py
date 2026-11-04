from pathlib import Path
p = Path("src-tauri/src/ssh.rs")
t = p.read_text(encoding="utf-8")
if "pub async fn sftp_hash" not in t:
    anchor = "    pub async fn sftp_read_text("
    method = '''    pub async fn sftp_hash(
        &self,
        session_id: &str,
        remote_path: String,
        max_bytes: Option<u64>,
    ) -> Result<String> {
        let max = max_bytes.unwrap_or(32 * 1024 * 1024);
        self.with_sftp(session_id, move |sftp| async move {
            use sha2::{Digest, Sha256};
            use tokio::io::AsyncReadExt;
            let mut file = sftp.open(&remote_path).await.context("sftp open for hash")?;
            let mut hasher = Sha256::new();
            let mut buf = vec![0u8; 64 * 1024];
            let mut got: u64 = 0;
            loop {
                if got >= max {
                    break;
                }
                let want = ((max - got) as usize).min(buf.len());
                let n = file.read(&mut buf[..want]).await.context("sftp read")?;
                if n == 0 {
                    break;
                }
                hasher.update(&buf[..n]);
                got += n as u64;
            }
            Ok(format!("{:x}", hasher.finalize()))
        })
        .await
    }

'''
    if anchor not in t:
        raise SystemExit("sftp_read_text missing")
    t = t.replace(anchor, method + anchor, 1)
    p.write_text(t, encoding="utf-8")
    print("sftp_hash added")
else:
    print("sftp_hash exists")
