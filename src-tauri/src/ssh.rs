use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use russh::client::{self, Handle, Msg};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKey};
use russh::{ChannelMsg, Disconnect};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

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

struct ClientHandler {
    session_id: String,
    app: AppHandle,
}

impl client::Handler for ClientHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        // Phase-1: accept all host keys (TOFU UI later)
        let _ = (&self.session_id, &self.app);
        Ok(true)
    }
}

#[allow(dead_code)]
struct LiveSession {
    handle: Handle<ClientHandler>,
    channel: AsyncMutex<russh::Channel<Msg>>,
    meta: SessionMeta,
    ring: Mutex<String>,
}

pub struct SshManager {
    sessions: AsyncMutex<HashMap<String, Arc<LiveSession>>>,
}

impl SshManager {
    pub fn new() -> Self {
        Self {
            sessions: AsyncMutex::new(HashMap::new()),
        }
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
            session_id: session_id.clone(),
            app: app.clone(),
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
            handle,
            channel: AsyncMutex::new(channel),
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

        let mut channel = live.handle
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
                return Ok(serde_json::json!({
                    "code": null,
                    "stdout": stdout,
                    "stderr": format!("{}\ntimeout", stderr),
                }));
            }
        }

        Ok(serde_json::json!({
            "code": code,
            "stdout": stdout,
            "stderr": stderr,
        }))
    }
}
