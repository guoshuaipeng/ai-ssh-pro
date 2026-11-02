use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde_json::json;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use crate::ssh::{SessionMeta, SshConnectResult, SshDataEvent, SshStatusEvent};

struct LocalSession {
    writer: Mutex<Box<dyn Write + Send>>,
    pair: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    meta: SessionMeta,
    ring: Mutex<String>,
}

pub struct LocalShellManager {
    sessions: AsyncMutex<HashMap<String, Arc<LocalSession>>>,
}

impl LocalShellManager {
    pub fn new() -> Self {
        Self {
            sessions: AsyncMutex::new(HashMap::new()),
        }
    }

    pub fn is_available() -> bool {
        true
    }

    pub async fn open(
        &self,
        app: AppHandle,
        cols: u32,
        rows: u32,
        start_cwd: Option<String>,
    ) -> Result<SshConnectResult> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: rows as u16,
                cols: cols as u16,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("open pty: {e}"))?;

        let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".into());
        let mut cmd = CommandBuilder::new(&shell);
        if shell.to_lowercase().contains("powershell") {
            cmd.arg("-NoLogo");
        }
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .unwrap_or_else(|_| ".".into());
        let cwd = start_cwd
            .as_ref()
            .filter(|p| std::path::Path::new(p).is_dir())
            .cloned()
            .unwrap_or(home);
        cmd.cwd(&cwd);

        let _child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| anyhow!("spawn shell: {e}"))?;
        // Keep slave dropped after spawn (owned by child on Unix; Windows ok)

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| anyhow!("clone reader: {e}"))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| anyhow!("take writer: {e}"))?;

        let session_id = format!("local:{}", Uuid::new_v4());
        let meta = SessionMeta {
            host: "localhost".into(),
            port: 0,
            username: std::env::var("USERNAME")
                .or_else(|_| std::env::var("USER"))
                .unwrap_or_else(|_| "local".into()),
            label: Some("本机 Shell".into()),
            connected_at: chrono::Utc::now().timestamp_millis(),
            term_cols: cols,
            term_rows: rows,
            kind: Some("local".into()),
        };

        let live = Arc::new(LocalSession {
            writer: Mutex::new(writer),
            pair: Mutex::new(pair.master),
            meta: meta.clone(),
            ring: Mutex::new(String::new()),
        });

        {
            let mut map = self.sessions.lock().await;
            map.insert(session_id.clone(), live.clone());
        }

        let app2 = app.clone();
        let sid = session_id.clone();
        let live2 = live.clone();
        thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).to_string();
                        {
                            let mut ring = live2.ring.lock();
                            ring.push_str(&chunk);
                            if ring.len() > 200_000 {
                                let keep = ring.len() - 150_000;
                                ring.drain(..keep);
                            }
                        }
                        crate::recording::append_global(&sid, &chunk);
                        let _ = app2.emit(
                            "ssh:data",
                            SshDataEvent {
                                session_id: sid.clone(),
                                chunk,
                            },
                        );
                    }
                    Err(_) => break,
                }
            }
            let _ = app2.emit(
                "ssh:status",
                SshStatusEvent {
                    session_id: sid,
                    status: "closed".into(),
                    message: None,
                },
            );
        });

        let _ = app.emit(
            "ssh:status",
            SshStatusEvent {
                session_id: session_id.clone(),
                status: "connected".into(),
                message: None,
            },
        );

        Ok(SshConnectResult { session_id, meta })
    }

    pub async fn write(&self, session_id: &str, data: &str) -> Result<bool> {
        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("local session not found"))?;
        let mut w = live.writer.lock();
        w.write_all(data.as_bytes()).context("pty write")?;
        w.flush().ok();
        Ok(true)
    }

    pub async fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<bool> {
        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("local session not found"))?;
        let master = live.pair.lock();
        master
            .resize(PtySize {
                rows: rows as u16,
                cols: cols as u16,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| anyhow!("pty resize: {e}"))?;
        Ok(true)
    }

    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        let mut map = self.sessions.lock().await;
        map.remove(session_id);
        Ok(())
    }

    pub async fn snapshot(&self, session_id: &str, max_chars: Option<usize>) -> Option<String> {
        let map = self.sessions.lock().await;
        let live = map.get(session_id)?;
        let ring = live.ring.lock().clone();
        let max = max_chars.unwrap_or(80_000);
        if ring.len() > max {
            Some(ring[ring.len() - max..].to_string())
        } else {
            Some(ring)
        }
    }

    pub fn availability_json() -> serde_json::Value {
        json!({ "available": true, "backend": "portable-pty" })
    }
}
