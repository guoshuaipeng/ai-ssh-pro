use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use russh::client::{self, Handle, Msg};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKey};
use russh::{ChannelMsg, Disconnect};
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use crate::forward::{ActiveForward, ForwardManager, ForwardSpec};
use crate::hostkey::{HostKeyPromptEvent, HostKeyWaiters};
use crate::known_hosts::{public_key_wire_bytes, algorithm_name, HostKeyCheck, KnownHostsStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectOptions {
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub label: Option<String>,
    pub term_cols: Option<u32>,
    pub term_rows: Option<u32>,
    pub auth_mode: Option<String>,
    pub demo: Option<bool>,
    pub forwards: Option<Vec<ForwardSpec>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionMeta {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub label: Option<String>,
    pub connected_at: i64,
    pub term_cols: u32,
    pub term_rows: u32,
    pub kind: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshConnectResult {
    pub session_id: String,
    pub meta: SessionMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshDataEvent {
    pub session_id: String,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshStatusEvent {
    pub session_id: String,
    pub status: String,
    pub message: Option<String>,
}

pub struct ClientHandler {
    pub host: String,
    pub port: u16,
    pub app: AppHandle,
    pub known: Arc<KnownHostsStore>,
    pub waiters: Arc<HostKeyWaiters>,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let bytes = match public_key_wire_bytes(server_public_key) {
            Ok(b) => b,
            Err(_) => return Ok(false),
        };
        match self.known.check(&self.host, self.port, &bytes) {
            HostKeyCheck::Trusted => Ok(true),
            check => {
                let (reason, fingerprint, previous) = match check {
                    HostKeyCheck::Unknown { fingerprint } => ("unknown", fingerprint, None),
                    HostKeyCheck::Changed {
                        fingerprint,
                        previous_fingerprint,
                    } => ("changed", fingerprint, Some(previous_fingerprint)),
                    HostKeyCheck::Trusted => unreachable!(),
                };
                let (request_id, rx) = self.waiters.register();
                let expires_at = chrono::Utc::now().timestamp_millis() + 120_000;
                let ev = HostKeyPromptEvent {
                    request_id: request_id.clone(),
                    host: self.host.clone(),
                    port: self.port,
                    fingerprint,
                    reason: reason.into(),
                    previous_fingerprint: previous,
                    key_type: Some(algorithm_name(server_public_key)),
                    expires_at: Some(expires_at),
                };
                let _ = self.app.emit("ssh:hostKeyPrompt", ev);
                match tokio::time::timeout(std::time::Duration::from_secs(120), rx).await {
                    Ok(Ok(decision)) => {
                        if decision.accept {
                            if decision.always_trust {
                                self.known.trust(&self.host, self.port, &bytes);
                            }
                            Ok(true)
                        } else {
                            Ok(false)
                        }
                    }
                    _ => {
                        self.waiters.cancel(&request_id);
                        let _ = self.app.emit(
                            "ssh:hostKeyExpired",
                            json!({ "requestId": request_id }),
                        );
                        Ok(false)
                    }
                }
            }
        }
    }
}

pub struct LiveSession {
    pub handle: Arc<Handle<ClientHandler>>,
    channel: AsyncMutex<russh::Channel<Msg>>,
    pub meta: SessionMeta,
    ring: Mutex<String>,
}

pub struct SshManager {
    sessions: AsyncMutex<HashMap<String, Arc<LiveSession>>>,
    known: Arc<KnownHostsStore>,
    waiters: Arc<HostKeyWaiters>,
    forwards: Arc<ForwardManager>,
}

impl SshManager {
    pub fn new(
        known: Arc<KnownHostsStore>,
        waiters: Arc<HostKeyWaiters>,
        forwards: Arc<ForwardManager>,
    ) -> Self {
        Self {
            sessions: AsyncMutex::new(HashMap::new()),
            known,
            waiters,
            forwards,
        }
    }

    pub fn known(&self) -> Arc<KnownHostsStore> {
        self.known.clone()
    }

    pub fn waiters(&self) -> Arc<HostKeyWaiters> {
        self.waiters.clone()
    }

    pub fn forwards(&self) -> Arc<ForwardManager> {
        self.forwards.clone()
    }

    pub async fn connect(
        &self,
        app: AppHandle,
        opts: SshConnectOptions,
    ) -> Result<SshConnectResult> {
        if opts.demo.unwrap_or(false) {
            return Err(anyhow!("demo host is not implemented in Tauri build yet"));
        }

        let port = opts.port.unwrap_or(22);
        let cols = opts.term_cols.unwrap_or(120);
        let rows = opts.term_rows.unwrap_or(32);
        let session_id = Uuid::new_v4().to_string();

        let config = client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(300)),
            ..Default::default()
        };
        let config = Arc::new(config);
        let handler = ClientHandler {
            host: opts.host.clone(),
            port,
            app: app.clone(),
            known: self.known.clone(),
            waiters: self.waiters.clone(),
        };

        let mut handle = client::connect(config, (opts.host.as_str(), port), handler)
            .await
            .with_context(|| format!("connect {}:{}", opts.host, port))?;

        let auth_mode = opts.auth_mode.as_deref().unwrap_or_else(|| {
            if opts
                .private_key_path
                .as_ref()
                .map(|s| !s.is_empty())
                .unwrap_or(false)
            {
                "key"
            } else {
                "password"
            }
        });

        let auth_ok = match auth_mode {
            "key" => {
                let path = opts
                    .private_key_path
                    .as_ref()
                    .ok_or_else(|| anyhow!("privateKeyPath required for key auth"))?;
                let key_pair = load_secret_key(PathBuf::from(path), opts.passphrase.as_deref())
                    .with_context(|| format!("load private key {}", path))?;
                let hash = handle.best_supported_rsa_hash().await?.flatten();
                let auth_res = handle
                    .authenticate_publickey(
                        opts.username.clone(),
                        PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash),
                    )
                    .await
                    .context("publickey auth")?;
                auth_res.success()
            }
            _ => {
                let password = opts
                    .password
                    .clone()
                    .ok_or_else(|| anyhow!("password required for password auth"))?;
                let auth_res = handle
                    .authenticate_password(opts.username.clone(), password)
                    .await
                    .context("password auth")?;
                auth_res.success()
            }
        };

        if !auth_ok {
            return Err(anyhow!("authentication failed"));
        }

        let handle = Arc::new(handle);
        let channel = handle.channel_open_session().await.context("open session")?;
        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .context("request pty")?;
        channel.request_shell(true).await.context("request shell")?;

        let meta = SessionMeta {
            host: opts.host.clone(),
            port,
            username: opts.username.clone(),
            label: opts.label.clone(),
            connected_at: chrono::Utc::now().timestamp_millis(),
            term_cols: cols,
            term_rows: rows,
            kind: Some("ssh".into()),
        };

        let live = Arc::new(LiveSession {
            handle: handle.clone(),
            channel: AsyncMutex::new(channel),
            meta: meta.clone(),
            ring: Mutex::new(String::new()),
        });

        {
            let mut map = self.sessions.lock().await;
            map.insert(session_id.clone(), live.clone());
        }

        // Optional profile local forwards
        if let Some(fwds) = opts.forwards.clone() {
            for f in fwds {
                let _ = self
                    .forwards
                    .start_local(session_id.clone(), handle.clone(), f, "profile")
                    .await;
            }
        }

        let app2 = app.clone();
        let sid = session_id.clone();
        let live2 = live.clone();
        let forwards = self.forwards.clone();
        tokio::spawn(async move {
            loop {
                let mut ch = live2.channel.lock().await;
                let msg = ch.wait().await;
                drop(ch);
                match msg {
                    Some(ChannelMsg::Data { ref data }) => {
                        let chunk = String::from_utf8_lossy(data).to_string();
                        {
                            let mut ring = live2.ring.lock();
                            ring.push_str(&chunk);
                            if ring.len() > 200_000 {
                                let keep = ring.len() - 150_000;
                                ring.drain(..keep);
                            }
                        }
                        let _ = app2.emit(
                            "ssh:data",
                            SshDataEvent {
                                session_id: sid.clone(),
                                chunk,
                            },
                        );
                    }
                    Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                        let chunk = String::from_utf8_lossy(data).to_string();
                        let _ = app2.emit(
                            "ssh:data",
                            SshDataEvent {
                                session_id: sid.clone(),
                                chunk,
                            },
                        );
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        let _ = forwards.stop_session(&sid).await;
                        let _ = app2.emit(
                            "ssh:status",
                            SshStatusEvent {
                                session_id: sid.clone(),
                                status: "closed".into(),
                                message: Some(format!("exit {}", exit_status)),
                            },
                        );
                        break;
                    }
                    Some(ChannelMsg::Eof) | None => {
                        let _ = forwards.stop_session(&sid).await;
                        let _ = app2.emit(
                            "ssh:status",
                            SshStatusEvent {
                                session_id: sid.clone(),
                                status: "closed".into(),
                                message: None,
                            },
                        );
                        break;
                    }
                    _ => {}
                }
            }
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

    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        let _ = self.forwards.stop_session(session_id).await;
        let mut map = self.sessions.lock().await;
        if let Some(live) = map.remove(session_id) {
            let ch = live.channel.lock().await;
            let _ = ch.close().await;
            let _ = live
                .handle
                .disconnect(Disconnect::ByApplication, "", "")
                .await;
        }
        Ok(())
    }

    pub async fn write(&self, session_id: &str, data: String) -> Result<bool> {
        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("session not found"))?;
        let ch = live.channel.lock().await;
        ch.data(&data.into_bytes()[..]).await?;
        Ok(true)
    }

    pub async fn resize(&self, session_id: &str, cols: u32, rows: u32) -> Result<bool> {
        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("session not found"))?;
        let ch = live.channel.lock().await;
        ch.window_change(cols, rows, 0, 0).await?;
        Ok(true)
    }

    pub async fn snapshot(
        &self,
        session_id: &str,
        max_chars: Option<usize>,
    ) -> Result<Option<String>> {
        let map = self.sessions.lock().await;
        let Some(live) = map.get(session_id) else {
            return Ok(None);
        };
        let ring = live.ring.lock().clone();
        let max = max_chars.unwrap_or(80_000);
        if ring.len() > max {
            Ok(Some(ring[ring.len() - max..].to_string()))
        } else {
            Ok(Some(ring))
        }
    }

    pub async fn exec(
        &self,
        session_id: &str,
        command: String,
        timeout_ms: Option<u64>,
    ) -> Result<serde_json::Value> {
        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("session not found"))?
            .clone();
        drop(map);

        let mut channel = live
            .handle
            .channel_open_session()
            .await
            .context("open exec channel")?;
        channel.exec(true, command).await.context("exec")?;

        let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(30_000));
        let mut stdout = String::new();
        let mut stderr = String::new();
        let mut code: Option<u32> = None;

        let fut = async {
            loop {
                match channel.wait().await {
                    Some(ChannelMsg::Data { ref data }) => {
                        stdout.push_str(&String::from_utf8_lossy(data));
                    }
                    Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                        stderr.push_str(&String::from_utf8_lossy(data));
                    }
                    Some(ChannelMsg::ExitStatus { exit_status }) => {
                        code = Some(exit_status);
                    }
                    Some(ChannelMsg::Eof) | None => break,
                    _ => {}
                }
            }
        };

        match tokio::time::timeout(timeout, fut).await {
            Ok(()) => {}
            Err(_) => {
                return Ok(json!({
                    "code": null,
                    "stdout": stdout,
                    "stderr": format!("{}\ntimeout", stderr),
                }));
            }
        }

        Ok(json!({
            "code": code,
            "stdout": stdout,
            "stderr": stderr,
        }))
    }

    async fn with_sftp<F, Fut, T>(&self, session_id: &str, f: F) -> Result<T>
    where
        F: FnOnce(SftpSession) -> Fut,
        Fut: std::future::Future<Output = Result<T>>,
    {
        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("session not found"))?
            .clone();
        drop(map);

        let channel = live
            .handle
            .channel_open_session()
            .await
            .context("open sftp channel")?;
        channel
            .request_subsystem(true, "sftp")
            .await
            .context("request sftp")?;
        let sftp = SftpSession::new(channel.into_stream())
            .await
            .context("sftp session")?;
        f(sftp).await
    }

    pub async fn sftp_list(&self, session_id: &str, remote_path: String) -> Result<serde_json::Value> {
        self.with_sftp(session_id, |sftp| async move {
            let path = if remote_path.is_empty() {
                sftp.canonicalize(".").await.unwrap_or_else(|_| ".".into())
            } else {
                remote_path
            };
            let entries = sftp.read_dir(&path).await.context("sftp read_dir")?;
            let mut out = Vec::new();
            for e in entries {
                let name = e.file_name();
                if name == "." || name == ".." {
                    continue;
                }
                let meta = e.metadata();
                let is_dir = meta.file_type().is_dir();
                let size = meta.size.unwrap_or(0);
                let mtime = meta.mtime.map(|t| (t as i64) * 1000);
                let full = if path.ends_with('/') {
                    format!("{path}{name}")
                } else {
                    format!("{path}/{name}")
                };
                out.push(json!({
                    "name": name,
                    "path": full,
                    "isDirectory": is_dir,
                    "size": size,
                    "modifyTime": mtime,
                    "mode": meta.permissions.map(|p| p as u32),
                }));
            }
            Ok(json!({ "path": path, "entries": out }))
        })
        .await
    }

    pub async fn sftp_home(&self, session_id: &str) -> Result<String> {
        self.with_sftp(session_id, |sftp| async move {
            let p = sftp.canonicalize(".").await.unwrap_or_else(|_| "/".into());
            Ok(p)
        })
        .await
    }

    pub async fn sftp_mkdir(&self, session_id: &str, remote_path: String) -> Result<()> {
        self.with_sftp(session_id, |sftp| async move {
            sftp.create_dir(&remote_path).await.context("mkdir")?;
            Ok(())
        })
        .await
    }

    pub async fn sftp_remove(&self, session_id: &str, remote_path: String) -> Result<()> {
        self.with_sftp(session_id, |sftp| async move {
            match sftp.metadata(&remote_path).await {
                Ok(m) if m.file_type().is_dir() => {
                    sftp.remove_dir(&remote_path).await.context("rmdir")?;
                }
                _ => {
                    sftp.remove_file(&remote_path).await.context("rm")?;
                }
            }
            Ok(())
        })
        .await
    }

    pub async fn sftp_rename(
        &self,
        session_id: &str,
        from_path: String,
        to_path: String,
    ) -> Result<()> {
        self.with_sftp(session_id, |sftp| async move {
            sftp.rename(&from_path, &to_path).await.context("rename")?;
            Ok(())
        })
        .await
    }

    pub async fn sftp_stat(
        &self,
        session_id: &str,
        remote_path: String,
    ) -> Result<Option<serde_json::Value>> {
        self.with_sftp(session_id, |sftp| async move {
            match sftp.metadata(&remote_path).await {
                Ok(m) => Ok(Some(json!({
                    "size": m.size.unwrap_or(0),
                    "mtime": m.mtime.map(|t| (t as i64) * 1000),
                    "isDirectory": m.file_type().is_dir(),
                }))),
                Err(_) => Ok(None),
            }
        })
        .await
    }

    pub async fn sftp_download(
        &self,
        session_id: &str,
        remote_path: String,
        local_path: String,
    ) -> Result<()> {
        self.with_sftp(session_id, |sftp| async move {
            use tokio::io::AsyncWriteExt;
            let mut remote = sftp
                .open(&remote_path)
                .await
                .with_context(|| format!("open remote {remote_path}"))?;
            if let Some(parent) = Path::new(&local_path).parent() {
                tokio::fs::create_dir_all(parent).await.ok();
            }
            let mut local = tokio::fs::File::create(&local_path)
                .await
                .with_context(|| format!("create local {local_path}"))?;
            tokio::io::copy(&mut remote, &mut local)
                .await
                .context("download copy")?;
            local.flush().await.ok();
            Ok(())
        })
        .await
    }

    pub async fn sftp_upload(
        &self,
        session_id: &str,
        local_path: String,
        remote_path: String,
    ) -> Result<()> {
        self.with_sftp(session_id, |sftp| async move {
            use russh_sftp::protocol::OpenFlags;
            let mut local = tokio::fs::File::open(&local_path)
                .await
                .with_context(|| format!("open local {local_path}"))?;
            let mut remote = sftp
                .open_with_flags(
                    &remote_path,
                    OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
                )
                .await
                .with_context(|| format!("open remote {remote_path}"))?;
            tokio::io::copy(&mut local, &mut remote)
                .await
                .context("upload copy")?;
            Ok(())
        })
        .await
    }

    pub async fn sftp_read_text(
        &self,
        session_id: &str,
        remote_path: String,
        max_bytes: Option<u64>,
    ) -> Result<serde_json::Value> {
        let max = max_bytes.unwrap_or(512 * 1024) as usize;
        self.with_sftp(session_id, |sftp| async move {
            let mut remote = sftp.open(&remote_path).await.context("open")?;
            let mut buf = Vec::new();
            let mut tmp = [0u8; 8192];
            let mut truncated = false;
            loop {
                let n = remote.read(&mut tmp).await.context("read")?;
                if n == 0 {
                    break;
                }
                if buf.len() + n > max {
                    buf.extend_from_slice(&tmp[..max - buf.len()]);
                    truncated = true;
                    break;
                }
                buf.extend_from_slice(&tmp[..n]);
            }
            let content = String::from_utf8_lossy(&buf).to_string();
            Ok(json!({
                "path": remote_path,
                "content": content,
                "size": buf.len(),
                "truncated": truncated,
                "encoding": "utf-8",
            }))
        })
        .await
    }

    pub async fn sftp_write_text(
        &self,
        session_id: &str,
        remote_path: String,
        content: String,
    ) -> Result<bool> {
        self.with_sftp(session_id, |sftp| async move {
            use russh_sftp::protocol::OpenFlags;
            use tokio::io::AsyncWriteExt;
            let mut remote = sftp
                .open_with_flags(
                    &remote_path,
                    OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
                )
                .await
                .context("open")?;
            remote.write_all(content.as_bytes()).await.context("write")?;
            Ok(true)
        })
        .await
    }

    pub async fn get_handle(&self, session_id: &str) -> Result<Arc<Handle<ClientHandler>>> {
        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("session not found"))?;
        Ok(live.handle.clone())
    }

    pub async fn add_forward(
        &self,
        session_id: String,
        spec: ForwardSpec,
    ) -> Result<ActiveForward> {
        let handle = self.get_handle(&session_id).await?;
        self.forwards
            .start_local(session_id, handle, spec, "manual")
            .await
    }
}
