use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use russh::client::{self, Handle, Msg};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKey};
use russh::{ChannelMsg, Disconnect};
use russh_sftp::client::SftpSession;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::io::AsyncReadExt;
use tauri::{AppHandle, Emitter};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use crate::forward::{
    spawn_forwarded_tcpip, ActiveForward, ForwardManager, ForwardSpec, RemoteForwardRouter,
};
use crate::hostkey::{HostKeyPromptEvent, HostKeyWaiters};
use crate::known_hosts::{algorithm_name, public_key_wire_bytes, HostKeyCheck, KnownHostsStore};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JumpHop {
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub auth: Option<String>,
    pub id: Option<String>,
    pub label: Option<String>,
}

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
    /// Legacy single bastion hop
    pub jump_host: Option<JumpHop>,
    /// Up to five ProxyJump hops (replaces jumpHost when set)
    pub jump_chain: Option<Vec<JumpHop>>,
    /// Forward local SSH agent to the *target* only (never jump hops).
    pub agent_forward: Option<bool>,
    /// Override agent socket / named pipe (default: SSH_AUTH_SOCK or Windows OpenSSH pipe).
    pub agent_socket: Option<String>,
    /// Used by probeJump (milliseconds).
    pub timeout_ms: Option<u64>,
    /// 1-based hop index to resume from after a prior mid-chain failure (Electron resumeFromHop).
    pub resume_from_hop: Option<u32>,
    /// When false, do not park/reuse jump slots (default true).
    pub jump_retry_from_failed_hop: Option<bool>,
    /// Health-probe short connection: authenticate only, no PTY/shell.
    pub probe_only: Option<bool>,
    /// Key for the held probe pool (usually profileId).
    pub probe_profile_id: Option<String>,
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
    pub remote_routes: Arc<RemoteForwardRouter>,
    /// When Some, accept auth-agent@openssh.com and proxy to this local agent path.
    pub agent_socket: Option<String>,
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

    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: russh::Channel<Msg>,
        _connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        if let Some(route) = self.remote_routes.take(connected_port) {
            spawn_forwarded_tcpip(channel, route);
        }
        Ok(())
    }

    async fn server_channel_open_agent_forward(
        &mut self,
        channel: russh::Channel<Msg>,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let Some(sock) = self.agent_socket.clone() else {
            return Ok(());
        };
        tokio::spawn(async move {
            if let Err(e) = proxy_agent_channel(channel, sock).await {
                eprintln!("[ssh] agent forward proxy error: {e:#}");
            }
        });
        Ok(())
    }
}

async fn proxy_agent_channel(channel: russh::Channel<Msg>, sock: String) -> anyhow::Result<()> {
    use tokio::io::AsyncWriteExt;
    let mut stream = channel.into_stream();
    #[cfg(windows)]
    {
        let mut pipe = tokio::net::windows::named_pipe::ClientOptions::new()
            .open(std::ffi::OsStr::new(&sock))
            .map_err(|e| anyhow::anyhow!("open agent pipe {sock}: {e}"))?;
        let _ = tokio::io::copy_bidirectional(&mut pipe, &mut stream).await;
        let _ = pipe.shutdown().await;
    }
    #[cfg(not(windows))]
    {
        let mut uds = tokio::net::UnixStream::connect(&sock)
            .await
            .map_err(|e| anyhow::anyhow!("connect agent uds {sock}: {e}"))?;
        let _ = tokio::io::copy_bidirectional(&mut uds, &mut stream).await;
        let _ = uds.shutdown().await;
    }
    Ok(())
}

pub struct LiveSession {
    pub handle: Arc<AsyncMutex<Handle<ClientHandler>>>,
    /// Intermediate ProxyJump hop handles (kept alive for the tunnel).
    jump_handles: Vec<Arc<AsyncMutex<Handle<ClientHandler>>>>,
    channel: AsyncMutex<russh::Channel<Msg>>,
    pub meta: SessionMeta,
    ring: Mutex<String>,
    remote_routes: Arc<RemoteForwardRouter>,
    /// When false (docker exec), disconnect only closes the channel — parent TCP stays up.
    owns_client: bool,
    parent_session_id: Option<String>,
}

struct JumpSlot {
    handles: Vec<Arc<AsyncMutex<Handle<ClientHandler>>>>,
    at: i64,
}

struct ProbeHeld {
    handle: Arc<AsyncMutex<Handle<ClientHandler>>>,
    jump_handles: Vec<Arc<AsyncMutex<Handle<ClientHandler>>>>,
    last_used: i64,
}

pub struct SshManager {
    sessions: AsyncMutex<HashMap<String, Arc<LiveSession>>>,
    known: Arc<KnownHostsStore>,
    waiters: Arc<HostKeyWaiters>,
    forwards: Arc<ForwardManager>,
    remote_routes: Arc<RemoteForwardRouter>,
    /// Successful jump hop handles parked after a later hop failed (Electron jumpSlots).
    jump_slots: Mutex<HashMap<String, JumpSlot>>,
    /// Independent health-probe short connections keyed by profileId.
    probe_held: AsyncMutex<HashMap<String, ProbeHeld>>,
}

impl SshManager {
    pub fn new(
        known: Arc<KnownHostsStore>,
        waiters: Arc<HostKeyWaiters>,
        forwards: Arc<ForwardManager>,
        remote_routes: Arc<RemoteForwardRouter>,
    ) -> Self {
        Self {
            sessions: AsyncMutex::new(HashMap::new()),
            known,
            waiters,
            forwards,
            remote_routes,
            jump_slots: Mutex::new(HashMap::new()),
            probe_held: AsyncMutex::new(HashMap::new()),
        }
    }

    pub fn remote_routes(&self) -> Arc<RemoteForwardRouter> {
        self.remote_routes.clone()
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

    fn resolve_hops(opts: &SshConnectOptions) -> Vec<JumpHop> {
        if let Some(chain) = &opts.jump_chain {
            if !chain.is_empty() {
                return chain.iter().take(5).cloned().collect();
            }
        }
        if let Some(j) = &opts.jump_host {
            if !j.host.trim().is_empty() && !j.username.trim().is_empty() {
                return vec![j.clone()];
            }
        }
        Vec::new()
    }

    fn jump_slot_key(opts: &SshConnectOptions, port: u16) -> String {
        let hops = Self::resolve_hops(opts);
        let chain = hops
            .iter()
            .map(|h| format!("{}@{}:{}", h.username, h.host, h.port.unwrap_or(22)))
            .collect::<Vec<_>>()
            .join("|");
        format!("{chain}>{}@{}:{port}", opts.username, opts.host.trim())
    }

    fn drop_jump_slot(&self, key: &str) {
        if let Some(slot) = self.jump_slots.lock().remove(key) {
            // Handles drop when Arc refcount hits 0; disconnect best-effort.
            for h in slot.handles {
                let h = h.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = h.lock().await.disconnect(Disconnect::ByApplication, "", "").await;
                });
            }
        }
    }

    fn format_hop_failure(hop: u32, total: u32, name: &str, addr: &str, reason: &str) -> String {
        format!("[hop {hop}/{total}] {name} ({addr}): {reason}")
    }

    pub fn default_agent_socket(override_sock: Option<&str>) -> Option<String> {
        if let Some(s) = override_sock.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            return Some(s.to_string());
        }
        if let Ok(s) = std::env::var("SSH_AUTH_SOCK") {
            let s = s.trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
        #[cfg(windows)]
        {
            return Some(r"\\.\pipe\openssh-ssh-agent".into());
        }
        #[cfg(not(windows))]
        {
            None
        }
    }

    /// Authenticate via local SSH agent (Windows named pipe / Unix SSH_AUTH_SOCK).
    pub async fn authenticate_with_agent<H: client::Handler + Send + 'static>(
        handle: &mut Handle<H>,
        username: &str,
        agent_socket: Option<&str>,
    ) -> Result<bool>
    where
        H::Error: From<russh::Error> + Send,
    {
        use russh::keys::agent::client::AgentClient;
        let sock = Self::default_agent_socket(agent_socket)
            .ok_or_else(|| anyhow!("未找到本机 SSH Agent（SSH_AUTH_SOCK / OpenSSH Authentication Agent）"))?;
        #[cfg(windows)]
        let mut agent = AgentClient::connect_named_pipe(&sock)
            .await
            .map_err(|e| anyhow!("连接 SSH Agent 失败 ({sock}): {e}"))?;
        #[cfg(not(windows))]
        let mut agent = AgentClient::connect_uds(&sock)
            .await
            .map_err(|e| anyhow!("连接 SSH Agent 失败 ({sock}): {e}"))?;
        let identities = agent
            .request_identities()
            .await
            .map_err(|e| anyhow!("列出 Agent 身份失败: {e}"))?;
        if identities.is_empty() {
            return Err(anyhow!("SSH Agent 中没有可用密钥"));
        }
        let hash = handle.best_supported_rsa_hash().await?.flatten();
        for identity in identities {
            let res = handle
                .authenticate_publickey_with(username.to_string(), identity, hash, &mut agent)
                .await
                .map_err(|e| anyhow!("agent auth: {e}"))?;
            if res.success() {
                return Ok(true);
            }
        }
        Ok(false)
    }

    async fn authenticate_handle(
        handle: &mut Handle<ClientHandler>,
        username: &str,
        password: Option<&str>,
        private_key_path: Option<&str>,
        passphrase: Option<&str>,
        auth_mode: Option<&str>,
        agent_socket: Option<&str>,
    ) -> Result<()> {
        let mode = auth_mode.unwrap_or_else(|| {
            if private_key_path.map(|s| !s.is_empty()).unwrap_or(false) {
                "key"
            } else if password.map(|s| !s.is_empty()).unwrap_or(false) {
                "password"
            } else {
                "agent"
            }
        });
        let ok = match mode {
            "key" => {
                let path = private_key_path
                    .ok_or_else(|| anyhow!("privateKeyPath required for key auth"))?;
                let key_pair = load_secret_key(PathBuf::from(path), passphrase)
                    .with_context(|| format!("load private key {path}"))?;
                let hash = handle.best_supported_rsa_hash().await?.flatten();
                let auth_res = handle
                    .authenticate_publickey(
                        username.to_string(),
                        PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash),
                    )
                    .await
                    .context("publickey auth")?;
                auth_res.success()
            }
            "agent" => Self::authenticate_with_agent(handle, username, agent_socket).await?,
            _ => {
                let password =
                    password.ok_or_else(|| anyhow!("password required for password auth"))?;
                let auth_res = handle
                    .authenticate_password(username.to_string(), password)
                    .await
                    .context("password auth")?;
                auth_res.success()
            }
        };
        if !ok {
            return Err(anyhow!("authentication failed for {username}"));
        }
        Ok(())
    }

    fn make_handler(
        &self,
        app: &AppHandle,
        host: &str,
        port: u16,
        agent_socket: Option<String>,
    ) -> ClientHandler {
        ClientHandler {
            host: host.to_string(),
            port,
            app: app.clone(),
            known: self.known.clone(),
            waiters: self.waiters.clone(),
            remote_routes: self.remote_routes.clone(),
            agent_socket,
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
        let hops = Self::resolve_hops(&opts);

        let config = Arc::new(client::Config {
            inactivity_timeout: Some(std::time::Duration::from_secs(300)),
            ..Default::default()
        });

        let mut jump_handles: Vec<Arc<AsyncMutex<Handle<ClientHandler>>>> = Vec::new();
        let mut handle: Handle<ClientHandler>;

        let target_agent_sock = if opts.agent_forward.unwrap_or(false) {
            Self::default_agent_socket(opts.agent_socket.as_deref())
        } else {
            None
        };

        if hops.is_empty() {
            let handler = self.make_handler(&app, &opts.host, port, target_agent_sock.clone());
            handle = client::connect(config.clone(), (opts.host.as_str(), port), handler)
                .await
                .with_context(|| format!("connect {}:{}", opts.host, port))?;
            Self::authenticate_handle(
                &mut handle,
                &opts.username,
                opts.password.as_deref(),
                opts.private_key_path.as_deref(),
                opts.passphrase.as_deref(),
                opts.auth_mode.as_deref(),
                opts.agent_socket.as_deref(),
            )
            .await?;

        } else {
            // ProxyJump with optional resume-from-failed-hop (Electron jumpSlots).
            let prefer_resume = opts.jump_retry_from_failed_hop.unwrap_or(true);
            let slot_key = Self::jump_slot_key(&opts, port);
            let hop_total = hops.len() as u32;
            let resume_from = opts.resume_from_hop.unwrap_or(0);

            if resume_from == 0 {
                self.drop_jump_slot(&slot_key);
            }

            let mut start_idx: usize = 0;
            let mut cur_opt: Option<Handle<ClientHandler>> = None;

            if prefer_resume && resume_from > 1 {
                let slot = self.jump_slots.lock().remove(&slot_key);
                if let Some(slot) = slot {
                    let need = (resume_from as usize).saturating_sub(1);
                    if slot.handles.len() >= need && need > 0 {
                        let kept: Vec<_> = slot.handles.into_iter().take(need).collect();
                        jump_handles.extend(kept.iter().cloned());
                        start_idx = need;
                        let last = kept.last().cloned();
                        if let Some(last) = last {
                            let next_host = if start_idx < hops.len() {
                                hops[start_idx].host.clone()
                            } else {
                                opts.host.clone()
                            };
                            let next_port = if start_idx < hops.len() {
                                hops[start_idx].port.unwrap_or(22)
                            } else {
                                port
                            };
                            match last
                                .lock()
                                .await
                                .channel_open_direct_tcpip(
                                    next_host.clone(),
                                    next_port as u32,
                                    "127.0.0.1".to_string(),
                                    0,
                                )
                                .await
                            {
                                Ok(channel) => {
                                    let stream = channel.into_stream();
                                    let is_target = start_idx >= hops.len();
                                    let hop_agent = if is_target {
                                        target_agent_sock.clone()
                                    } else {
                                        None
                                    };
                                    let handler =
                                        self.make_handler(&app, &next_host, next_port, hop_agent);
                                    match client::connect_stream(config.clone(), stream, handler)
                                        .await
                                    {
                                        Ok(h) => cur_opt = Some(h),
                                        Err(_) => {
                                            start_idx = 0;
                                            jump_handles.clear();
                                        }
                                    }
                                }
                                Err(_) => {
                                    start_idx = 0;
                                    jump_handles.clear();
                                }
                            }
                        }
                    }
                }
            }

            // Build remaining chain from start_idx: remaining hops + target
            let mut chain: Vec<(String, u16, String, Option<String>, Option<String>, Option<String>, Option<String>, bool)> =
                Vec::new();
            for (i, h) in hops.iter().enumerate() {
                if i < start_idx {
                    continue;
                }
                chain.push((
                    h.host.clone(),
                    h.port.unwrap_or(22),
                    h.username.clone(),
                    h.password.clone(),
                    h.private_key_path.clone(),
                    h.passphrase.clone(),
                    h.auth.clone(),
                    false,
                ));
            }
            chain.push((
                opts.host.clone(),
                port,
                opts.username.clone(),
                opts.password.clone(),
                opts.private_key_path.clone(),
                opts.passphrase.clone(),
                opts.auth_mode.clone(),
                true,
            ));

            // If resume already opened the first remaining hop into cur_opt, auth it then continue
            let mut chain_iter = chain.into_iter().enumerate();
            let mut cur: Handle<ClientHandler>;

            if let Some(mut existing) = cur_opt.take() {
                let Some((ci, (nh, np, nu, npw, npk, npp, nam, is_target))) = chain_iter.next() else {
                    return Err(anyhow!("resume chain empty"));
                };
                let hop_no = if is_target { hop_total.saturating_add(1) } else { (start_idx + ci + 1) as u32 };
                let name = if is_target {
                    opts.host.clone()
                } else {
                    hops.get(start_idx + ci)
                        .and_then(|h| h.label.clone())
                        .unwrap_or_else(|| nh.clone())
                };
                let _ = app.emit(
                    "ssh:hop",
                    json!({ "hop": hop_no.min(hop_total.max(1)), "total": hop_total.max(1), "name": name, "phase": "resume" }),
                );
                if let Err(e) = Self::authenticate_handle(
                    &mut existing,
                    &nu,
                    npw.as_deref(),
                    npk.as_deref(),
                    npp.as_deref(),
                    nam.as_deref(),
                    if is_target { opts.agent_socket.as_deref() } else { None },
                )
                .await
                {
                    // failed the resumed hop — keep prior jump_handles parked
                    if prefer_resume && !jump_handles.is_empty() {
                        self.jump_slots.lock().insert(
                            slot_key.clone(),
                            JumpSlot {
                                handles: jump_handles.clone(),
                                at: chrono::Utc::now().timestamp_millis(),
                            },
                        );
                    }
                    let reason = format!("{e:#}");
                    return Err(anyhow!(Self::format_hop_failure(
                        hop_no.min(hop_total.max(1)),
                        hop_total.max(1),
                        &name,
                        &format!("{nh}:{np}"),
                        &reason,
                    )));
                }
                cur = existing;
                // continue with rest below using same loop pattern
                for (ci, (nh, np, nu, npw, npk, npp, nam, is_target)) in chain_iter {
                    let hop_idx_display = if is_target {
                        hop_total
                    } else {
                        (start_idx + ci + 1) as u32
                    };
                    let name = if is_target {
                        opts.label.clone().unwrap_or_else(|| opts.host.clone())
                    } else {
                        hops.get(start_idx + ci)
                            .and_then(|h| h.label.clone())
                            .unwrap_or_else(|| nh.clone())
                    };
                    if !is_target {
                        let _ = app.emit(
                            "ssh:hop",
                            json!({ "hop": hop_idx_display, "total": hop_total, "name": name, "phase": "connecting" }),
                        );
                    }
                    let channel = match cur
                        .channel_open_direct_tcpip(nh.clone(), np as u32, "127.0.0.1".to_string(), 0)
                        .await
                    {
                        Ok(c) => c,
                        Err(e) => {
                            if prefer_resume && !is_target && !jump_handles.is_empty() {
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            }
                            return Err(anyhow!(Self::format_hop_failure(
                                hop_idx_display.max(1),
                                hop_total.max(1),
                                &name,
                                &format!("{nh}:{np}"),
                                &format!("{e:#}"),
                            )));
                        }
                    };
                    let stream = channel.into_stream();
                    jump_handles.push(Arc::new(AsyncMutex::new(cur)));
                    let hop_agent = if is_target {
                        target_agent_sock.clone()
                    } else {
                        None
                    };
                    let handler = self.make_handler(&app, &nh, np, hop_agent);
                    cur = match client::connect_stream(config.clone(), stream, handler).await {
                        Ok(h) => h,
                        Err(e) => {
                            if prefer_resume && !is_target {
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            }
                            return Err(anyhow!(Self::format_hop_failure(
                                hop_idx_display.max(1),
                                hop_total.max(1),
                                &name,
                                &format!("{nh}:{np}"),
                                &format!("{e:#}"),
                            )));
                        }
                    };
                    if let Err(e) = Self::authenticate_handle(
                        &mut cur,
                        &nu,
                        npw.as_deref(),
                        npk.as_deref(),
                        npp.as_deref(),
                        nam.as_deref(),
                        if is_target {
                            opts.agent_socket.as_deref()
                        } else {
                            None
                        },
                    )
                    .await
                    {
                        if prefer_resume && !is_target {
                            // pop the just-pushed previous? jump_handles already has previous hops
                            self.jump_slots.lock().insert(
                                slot_key.clone(),
                                JumpSlot {
                                    handles: jump_handles.clone(),
                                    at: chrono::Utc::now().timestamp_millis(),
                                },
                            );
                        }
                        return Err(anyhow!(Self::format_hop_failure(
                            hop_idx_display.max(1),
                            hop_total.max(1),
                            &name,
                            &format!("{nh}:{np}"),
                            &format!("{e:#}"),
                        )));
                    }
                }
            } else {
                // Fresh chain: connect first remaining hop via TCP if start_idx==0 and first is hop
                let Some((ci0, (h0, p0, u0, pw0, pk0, pp0, am0, is_target0))) = chain_iter.next() else {
                    return Err(anyhow!("empty jump chain"));
                };
                let name0 = if is_target0 {
                    opts.host.clone()
                } else {
                    hops.get(start_idx + ci0)
                        .and_then(|h| h.label.clone())
                        .unwrap_or_else(|| h0.clone())
                };
                if !is_target0 {
                    let _ = app.emit(
                        "ssh:hop",
                        json!({ "hop": 1u32, "total": hop_total, "name": name0, "phase": "connecting" }),
                    );
                }
                let handler = self.make_handler(
                    &app,
                    &h0,
                    p0,
                    if is_target0 {
                        target_agent_sock.clone()
                    } else {
                        None
                    },
                );
                cur = match client::connect(config.clone(), (h0.as_str(), p0), handler).await {
                    Ok(h) => h,
                    Err(e) => {
                        return Err(anyhow!(Self::format_hop_failure(
                            1,
                            hop_total.max(1),
                            &name0,
                            &format!("{h0}:{p0}"),
                            &format!("{e:#}"),
                        )));
                    }
                };
                if let Err(e) = Self::authenticate_handle(
                    &mut cur,
                    &u0,
                    pw0.as_deref(),
                    pk0.as_deref(),
                    pp0.as_deref(),
                    am0.as_deref(),
                    if is_target0 {
                        opts.agent_socket.as_deref()
                    } else {
                        None
                    },
                )
                .await
                {
                    return Err(anyhow!(Self::format_hop_failure(
                        1,
                        hop_total.max(1),
                        &name0,
                        &format!("{h0}:{p0}"),
                        &format!("{e:#}"),
                    )));
                }

                for (ci, (nh, np, nu, npw, npk, npp, nam, is_target)) in chain_iter {
                    let hop_idx_display = if is_target {
                        hop_total
                    } else {
                        (start_idx + ci + 1) as u32
                    };
                    let name = if is_target {
                        opts.label.clone().unwrap_or_else(|| opts.host.clone())
                    } else {
                        hops.get(start_idx + ci)
                            .and_then(|h| h.label.clone())
                            .unwrap_or_else(|| nh.clone())
                    };
                    if !is_target {
                        let _ = app.emit(
                            "ssh:hop",
                            json!({ "hop": hop_idx_display, "total": hop_total, "name": name, "phase": "connecting" }),
                        );
                    }
                    let channel = match cur
                        .channel_open_direct_tcpip(nh.clone(), np as u32, "127.0.0.1".to_string(), 0)
                        .await
                    {
                        Ok(c) => c,
                        Err(e) => {
                            if prefer_resume && !jump_handles.is_empty() {
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            } else if prefer_resume {
                                // first hop ok, failure forwarding — park cur as first hop
                                jump_handles.push(Arc::new(AsyncMutex::new(cur)));
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                                return Err(anyhow!(Self::format_hop_failure(
                                    hop_idx_display.max(1),
                                    hop_total.max(1),
                                    &name,
                                    &format!("{nh}:{np}"),
                                    &format!("{e:#}"),
                                )));
                            }
                            return Err(anyhow!(Self::format_hop_failure(
                                hop_idx_display.max(1),
                                hop_total.max(1),
                                &name,
                                &format!("{nh}:{np}"),
                                &format!("{e:#}"),
                            )));
                        }
                    };
                    let stream = channel.into_stream();
                    jump_handles.push(Arc::new(AsyncMutex::new(cur)));
                    let hop_agent = if is_target {
                        target_agent_sock.clone()
                    } else {
                        None
                    };
                    let handler = self.make_handler(&app, &nh, np, hop_agent);
                    cur = match client::connect_stream(config.clone(), stream, handler).await {
                        Ok(h) => h,
                        Err(e) => {
                            if prefer_resume {
                                self.jump_slots.lock().insert(
                                    slot_key.clone(),
                                    JumpSlot {
                                        handles: jump_handles.clone(),
                                        at: chrono::Utc::now().timestamp_millis(),
                                    },
                                );
                            }
                            return Err(anyhow!(Self::format_hop_failure(
                                hop_idx_display.max(1),
                                hop_total.max(1),
                                &name,
                                &format!("{nh}:{np}"),
                                &format!("{e:#}"),
                            )));
                        }
                    };
                    if let Err(e) = Self::authenticate_handle(
                        &mut cur,
                        &nu,
                        npw.as_deref(),
                        npk.as_deref(),
                        npp.as_deref(),
                        nam.as_deref(),
                        if is_target {
                            opts.agent_socket.as_deref()
                        } else {
                            None
                        },
                    )
                    .await
                    {
                        if prefer_resume && !is_target {
                            self.jump_slots.lock().insert(
                                slot_key.clone(),
                                JumpSlot {
                                    handles: jump_handles.clone(),
                                    at: chrono::Utc::now().timestamp_millis(),
                                },
                            );
                        }
                        return Err(anyhow!(Self::format_hop_failure(
                            hop_idx_display.max(1),
                            hop_total.max(1),
                            &name,
                            &format!("{nh}:{np}"),
                            &format!("{e:#}"),
                        )));
                    }
                }
            }

            self.jump_slots.lock().remove(&slot_key);
            handle = cur;
        }


        let handle = Arc::new(AsyncMutex::new(handle));
        if opts.probe_only.unwrap_or(false) {
            let key = opts
                .probe_profile_id
                .clone()
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| session_id.clone());
            let now = chrono::Utc::now().timestamp_millis();
            {
                let mut held = self.probe_held.lock().await;
                held.insert(
                    key.clone(),
                    ProbeHeld {
                        handle: handle.clone(),
                        jump_handles,
                        last_used: now,
                    },
                );
            }
            let meta = SessionMeta {
                host: opts.host.clone(),
                port,
                username: opts.username.clone(),
                label: opts.label.clone(),
                connected_at: now,
                term_cols: cols,
                term_rows: rows,
                kind: Some("probe".into()),
            };
            return Ok(SshConnectResult {
                session_id: key,
                meta,
            });
        }
        let channel = handle.lock().await.channel_open_session().await.context("open session")?;
        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .context("request pty")?;
        channel.request_shell(true).await.context("request shell")?;
        if opts.agent_forward.unwrap_or(false) {
            let _ = channel.agent_forward(true).await;
        }
        let _ = app.emit("ssh:stage", json!({ "stage": "shell", "host": opts.host, "port": port }));

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
            jump_handles,
            channel: AsyncMutex::new(channel),
            meta: meta.clone(),
            ring: Mutex::new(String::new()),
            remote_routes: self.remote_routes.clone(),
            owns_client: true,
            parent_session_id: None,
        });

        {
            let mut map = self.sessions.lock().await;
            map.insert(session_id.clone(), live.clone());
        }

        if let Some(fwds) = opts.forwards.clone() {
            for f in fwds {
                let _ = self
                    .forwards
                    .start(
                        session_id.clone(),
                        handle.clone(),
                        self.remote_routes.clone(),
                        f,
                        "profile",
                    )
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
                        crate::recording::append_global(&sid, &chunk);
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
                        crate::recording::append_global(&sid, &chunk);
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
                                message: Some(format!("exit {exit_status}")),
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
        let child_ids: Vec<String> = map
            .iter()
            .filter(|(id, s)| {
                *id != session_id && s.parent_session_id.as_deref() == Some(session_id)
            })
            .map(|(id, _)| id.clone())
            .collect();
        for cid in child_ids {
            if let Some(child) = map.remove(&cid) {
                let ch = child.channel.lock().await;
                let _ = ch.close().await;
            }
        }
        if let Some(live) = map.remove(session_id) {
            let ch = live.channel.lock().await;
            let _ = ch.close().await;
            if live.owns_client {
                {
                    let h = live.handle.lock().await;
                    let _ = h.disconnect(Disconnect::ByApplication, "", "").await;
                }
                for j in &live.jump_handles {
                    let h = j.lock().await;
                    let _ = h.disconnect(Disconnect::ByApplication, "", "").await;
                }
            }
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
        let handle = {
            let map = self.sessions.lock().await;
            if let Some(live) = map.get(session_id) {
                let h = live.handle.clone();
                drop(map);
                h
            } else {
                drop(map);
                let mut held = self.probe_held.lock().await;
                let row = held
                    .get_mut(session_id)
                    .ok_or_else(|| anyhow!("session not found"))?;
                row.last_used = chrono::Utc::now().timestamp_millis();
                row.handle.clone()
            }
        };

        let mut channel = handle
            .lock()
            .await
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
            .lock()
            .await
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
        app: AppHandle,
        session_id: &str,
        remote_path: String,
        local_path: String,
    ) -> Result<()> {
        let sid = session_id.to_string();
        self.with_sftp(session_id, move |sftp| async move {
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let meta = sftp.metadata(&remote_path).await.ok();
            let total = meta.and_then(|m| m.size).unwrap_or(0);
            let transfer_id = Uuid::new_v4().to_string();
            let name = Path::new(&remote_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| remote_path.clone());
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
            let mut buf = [0u8; 32 * 1024];
            let mut transferred: u64 = 0;
            loop {
                let n = remote.read(&mut buf).await.context("download read")?;
                if n == 0 {
                    break;
                }
                local.write_all(&buf[..n]).await.context("download write")?;
                transferred += n as u64;
                let _ = app.emit(
                    "sftp:progress",
                    json!({
                        "transferId": transfer_id,
                        "sessionId": sid,
                        "direction": "download",
                        "name": name,
                        "transferred": transferred,
                        "total": total,
                    }),
                );
            }
            local.flush().await.ok();
            let _ = app.emit(
                "sftp:progress",
                json!({
                    "transferId": transfer_id,
                    "sessionId": sid,
                    "direction": "download",
                    "name": name,
                    "transferred": transferred,
                    "total": if total > 0 { total } else { transferred },
                    "done": true,
                }),
            );
            Ok(())
        })
        .await
    }

    pub async fn sftp_upload(
        &self,
        app: AppHandle,
        session_id: &str,
        local_path: String,
        remote_path: String,
    ) -> Result<()> {
        let sid = session_id.to_string();
        self.with_sftp(session_id, move |sftp| async move {
            use russh_sftp::protocol::OpenFlags;
            use tokio::io::{AsyncReadExt, AsyncWriteExt};
            let meta = tokio::fs::metadata(&local_path).await.ok();
            let total = meta.map(|m| m.len()).unwrap_or(0);
            let transfer_id = Uuid::new_v4().to_string();
            let name = Path::new(&local_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| local_path.clone());
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
            let mut buf = [0u8; 32 * 1024];
            let mut transferred: u64 = 0;
            loop {
                let n = local.read(&mut buf).await.context("upload read")?;
                if n == 0 {
                    break;
                }
                remote.write_all(&buf[..n]).await.context("upload write")?;
                transferred += n as u64;
                let _ = app.emit(
                    "sftp:progress",
                    json!({
                        "transferId": transfer_id,
                        "sessionId": sid,
                        "direction": "upload",
                        "name": name,
                        "transferred": transferred,
                        "total": total,
                    }),
                );
            }
            let _ = app.emit(
                "sftp:progress",
                json!({
                    "transferId": transfer_id,
                    "sessionId": sid,
                    "direction": "upload",
                    "name": name,
                    "transferred": transferred,
                    "total": if total > 0 { total } else { transferred },
                    "done": true,
                }),
            );
            Ok(())
        })
        .await
    }

    pub async fn sftp_chmod(
        &self,
        session_id: &str,
        remote_path: String,
        mode: u32,
    ) -> Result<()> {
        self.with_sftp(session_id, move |sftp| async move {
            use russh_sftp::protocol::FileAttributes;
            let bits = mode & 0o7777;
            let attrs = FileAttributes {
                permissions: Some(bits),
                ..Default::default()
            };
            sftp.set_metadata(&remote_path, attrs)
                .await
                .with_context(|| format!("chmod {remote_path} {bits:o}"))?;
            Ok(())
        })
        .await
    }

    pub async fn sftp_hash(
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

    pub async fn get_handle(&self, session_id: &str) -> Result<Arc<AsyncMutex<Handle<ClientHandler>>>> {
        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("session not found"))?;
        Ok(live.handle.clone())
    }


    pub async fn probe_sweep(&self, max_idle_ms: u64) -> Value {
        let now = chrono::Utc::now().timestamp_millis();
        let limit = max_idle_ms as i64;
        let mut held = self.probe_held.lock().await;
        let drop_ids: Vec<String> = held
            .iter()
            .filter(|(_, row)| now - row.last_used >= limit)
            .map(|(id, _)| id.clone())
            .collect();
        for id in &drop_ids {
            held.remove(id);
        }
        json!({ "ok": true, "dropped": drop_ids.len(), "open": held.len() })
    }

    pub async fn probe_release(&self, profile_id: Option<String>) -> Value {
        let mut held = self.probe_held.lock().await;
        if let Some(id) = profile_id.filter(|s| !s.trim().is_empty()) {
            held.remove(&id);
        } else {
            held.clear();
        }
        json!({ "ok": true, "open": held.len() })
    }

    pub async fn probe_open(
        &self,
        app: AppHandle,
        profile_id: String,
        opts: SshConnectOptions,
    ) -> Result<SshConnectResult> {
        let mut opts = opts;
        opts.probe_only = Some(true);
        opts.probe_profile_id = Some(profile_id);
        // Drop previous held for this profile before reconnect
        if let Some(pid) = opts.probe_profile_id.clone() {
            let mut held = self.probe_held.lock().await;
            held.remove(&pid);
        }
        self.connect(app, opts).await
    }

    pub async fn add_forward(
        &self,
        session_id: String,
        spec: ForwardSpec,
    ) -> Result<ActiveForward> {
        let handle = self.get_handle(&session_id).await?;
        self.forwards
            .start(
                session_id,
                handle,
                self.remote_routes.clone(),
                spec,
                "manual",
            )
            .await
    }

    /// Open an interactive `docker exec` PTY on the same SSH client (does not own TCP).
    pub async fn open_docker_exec(
        &self,
        app: AppHandle,
        parent_session_id: &str,
        container_id: &str,
        cols: Option<u32>,
        rows: Option<u32>,
        label: Option<String>,
    ) -> Result<SshConnectResult> {
        let id = container_id.trim();
        if id.is_empty()
            || id.len() > 128
            || !id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-' | '.' | ':'))
        {
            return Err(anyhow!("非法容器 ID"));
        }
        let parent = {
            let map = self.sessions.lock().await;
            map.get(parent_session_id)
                .cloned()
                .ok_or_else(|| anyhow!("父会话不存在或已断开"))?
        };
        if !parent.owns_client {
            return Err(anyhow!("不能在 docker exec 会话上再开容器 Shell"));
        }
        let cols = cols.unwrap_or(parent.meta.term_cols).max(20);
        let rows = rows.unwrap_or(parent.meta.term_rows).max(5);
        let handle = parent.handle.clone();
        let channel = handle
            .lock()
            .await
            .channel_open_session()
            .await
            .context("open docker exec session")?;
        channel
            .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
            .await
            .context("request pty")?;
        let remote_cmd = format!(
            "docker exec -it {id} sh -lc 'if command -v bash >/dev/null 2>&1; then exec bash -i; else exec sh -i; fi'"
        );
        channel
            .exec(true, remote_cmd)
            .await
            .context("docker exec")?;

        let session_id = Uuid::new_v4().to_string();
        let short = if id.len() > 12 { &id[..12] } else { id };
        let meta = SessionMeta {
            host: parent.meta.host.clone(),
            port: parent.meta.port,
            username: parent.meta.username.clone(),
            label: Some(label.unwrap_or_else(|| format!("docker exec {short}"))),
            connected_at: chrono::Utc::now().timestamp_millis(),
            term_cols: cols,
            term_rows: rows,
            kind: Some("docker-exec".into()),
        };
        let live = Arc::new(LiveSession {
            handle: handle.clone(),
            jump_handles: vec![],
            channel: AsyncMutex::new(channel),
            meta: meta.clone(),
            ring: Mutex::new(String::new()),
            remote_routes: self.remote_routes.clone(),
            owns_client: false,
            parent_session_id: Some(parent_session_id.to_string()),
        });
        {
            let mut map = self.sessions.lock().await;
            map.insert(session_id.clone(), live.clone());
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
                        crate::recording::append_global(&sid, &chunk);
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
                        crate::recording::append_global(&sid, &chunk);
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
                                message: Some(format!("exit {exit_status}")),
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

    /// Resumable SFTP transfer using `.aisshpart` + optional byte offset (AsyncSeek / APPEND).
    pub async fn sftp_transfer(
        &self,
        app: AppHandle,
        session_id: &str,
        direction: String,
        local_path: String,
        remote_path: String,
        offset: Option<u64>,
    ) -> Result<()> {
        let dir = direction.to_lowercase();
        if dir == "download" || dir == "get" {
            self.sftp_download_resumable(app, session_id, remote_path, local_path, offset)
                .await
        } else if dir == "upload" || dir == "put" {
            self.sftp_upload_resumable(app, session_id, local_path, remote_path, offset)
                .await
        } else {
            Err(anyhow!("direction 须为 download 或 upload"))
        }
    }

    async fn sftp_download_resumable(
        &self,
        app: AppHandle,
        session_id: &str,
        remote_path: String,
        local_path: String,
        offset: Option<u64>,
    ) -> Result<()> {
        let sid = session_id.to_string();
        self.with_sftp(session_id, move |sftp| async move {
            use std::io::SeekFrom;
            use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
            let meta = sftp.metadata(&remote_path).await.ok();
            let total = meta.and_then(|m| m.size).unwrap_or(0);
            let transfer_id = Uuid::new_v4().to_string();
            let name = Path::new(&remote_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| remote_path.clone());
            let part = format!("{local_path}.aisshpart");
            if let Some(parent) = Path::new(&local_path).parent() {
                tokio::fs::create_dir_all(parent).await.ok();
            }
            let mut off = offset.unwrap_or(0);
            if total > 0 {
                off = off.min(total);
            }
            if off == 0 {
                let _ = tokio::fs::remove_file(&part).await;
            }
            let mut remote = sftp
                .open(&remote_path)
                .await
                .with_context(|| format!("open remote {remote_path}"))?;
            if off > 0 {
                remote
                    .seek(SeekFrom::Start(off))
                    .await
                    .context("seek remote")?;
            }
            let mut local = if off > 0 {
                tokio::fs::OpenOptions::new()
                    .create(true)
                    .append(true)
                    .open(&part)
                    .await
                    .with_context(|| format!("append local {part}"))?
            } else {
                tokio::fs::File::create(&part)
                    .await
                    .with_context(|| format!("create local {part}"))?
            };
            let mut buf = [0u8; 32 * 1024];
            let mut transferred = off;
            loop {
                let n = remote.read(&mut buf).await.context("download read")?;
                if n == 0 {
                    break;
                }
                local.write_all(&buf[..n]).await.context("download write")?;
                transferred += n as u64;
                let _ = app.emit(
                    "sftp:progress",
                    json!({
                        "transferId": transfer_id,
                        "sessionId": sid,
                        "direction": "download",
                        "name": name,
                        "transferred": transferred,
                        "total": total,
                        "resumedFrom": off,
                    }),
                );
            }
            local.flush().await.ok();
            drop(local);
            let _ = tokio::fs::remove_file(&local_path).await;
            tokio::fs::rename(&part, &local_path)
                .await
                .with_context(|| format!("rename {part} -> {local_path}"))?;
            let _ = app.emit(
                "sftp:progress",
                json!({
                    "transferId": transfer_id,
                    "sessionId": sid,
                    "direction": "download",
                    "name": name,
                    "transferred": transferred,
                    "total": if total > 0 { total } else { transferred },
                    "done": true,
                    "resumedFrom": off,
                }),
            );
            Ok(())
        })
        .await
    }

    async fn sftp_upload_resumable(
        &self,
        app: AppHandle,
        session_id: &str,
        local_path: String,
        remote_path: String,
        offset: Option<u64>,
    ) -> Result<()> {
        let sid = session_id.to_string();
        self.with_sftp(session_id, move |sftp| async move {
            use russh_sftp::protocol::OpenFlags;
            use std::io::SeekFrom;
            use tokio::io::{AsyncReadExt, AsyncSeekExt, AsyncWriteExt};
            let meta = tokio::fs::metadata(&local_path).await.ok();
            let total = meta.map(|m| m.len()).unwrap_or(0);
            let transfer_id = Uuid::new_v4().to_string();
            let name = Path::new(&local_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| local_path.clone());
            let remote_part = if remote_path.ends_with(".aisshpart") {
                remote_path.clone()
            } else {
                format!("{remote_path}.aisshpart")
            };
            let off = offset.unwrap_or(0).min(total);
            let mut local = tokio::fs::File::open(&local_path)
                .await
                .with_context(|| format!("open local {local_path}"))?;
            if off > 0 {
                local
                    .seek(SeekFrom::Start(off))
                    .await
                    .context("seek local")?;
            }
            let mut remote = if off > 0 {
                sftp.open_with_flags(
                    &remote_part,
                    OpenFlags::CREATE | OpenFlags::WRITE | OpenFlags::APPEND,
                )
                .await
                .with_context(|| format!("append remote {remote_part}"))?
            } else {
                sftp.open_with_flags(
                    &remote_part,
                    OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
                )
                .await
                .with_context(|| format!("create remote {remote_part}"))?
            };
            let mut buf = [0u8; 32 * 1024];
            let mut transferred = off;
            loop {
                let n = local.read(&mut buf).await.context("upload read")?;
                if n == 0 {
                    break;
                }
                remote.write_all(&buf[..n]).await.context("upload write")?;
                transferred += n as u64;
                let _ = app.emit(
                    "sftp:progress",
                    json!({
                        "transferId": transfer_id,
                        "sessionId": sid,
                        "direction": "upload",
                        "name": name,
                        "transferred": transferred,
                        "total": total,
                        "resumedFrom": off,
                    }),
                );
            }
            let _ = remote.shutdown().await;
            drop(remote);
            let _ = sftp.remove_file(&remote_path).await;
            sftp.rename(&remote_part, &remote_path)
                .await
                .with_context(|| format!("rename {remote_part} -> {remote_path}"))?;
            let _ = app.emit(
                "sftp:progress",
                json!({
                    "transferId": transfer_id,
                    "sessionId": sid,
                    "direction": "upload",
                    "name": name,
                    "transferred": transferred,
                    "total": if total > 0 { total } else { transferred },
                    "done": true,
                    "resumedFrom": off,
                }),
            );
            Ok(())
        })
        .await
    }

    /// Long-running `docker events` reader; emits `docker:changed`.
    pub async fn start_docker_events_watch(
        &self,
        app: AppHandle,
        session_id: &str,
        stop: Arc<std::sync::atomic::AtomicBool>,
    ) -> Result<()> {
        use std::sync::atomic::Ordering;
        let live = {
            let map = self.sessions.lock().await;
            map.get(session_id)
                .cloned()
                .ok_or_else(|| anyhow!("session not found"))?
        };
        let mut channel = live
            .handle
            .lock()
            .await
            .channel_open_session()
            .await
            .context("open events channel")?;
        channel
            .exec(true, "docker events --format '{{json .}}'")
            .await
            .context("docker events")?;
        let sid = session_id.to_string();
        tokio::spawn(async move {
            let mut buf = String::new();
            loop {
                if stop.load(Ordering::SeqCst) {
                    let _ = channel.close().await;
                    break;
                }
                let msg = channel.wait().await;
                match msg {
                    Some(ChannelMsg::Data { ref data })
                    | Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                        buf.push_str(&String::from_utf8_lossy(data));
                        while let Some(idx) = buf.find('\n') {
                            let line = buf[..idx].trim().to_string();
                            buf.drain(..=idx);
                            if line.is_empty() {
                                continue;
                            }
                            let parsed: Value =
                                serde_json::from_str(&line).unwrap_or(Value::Null);
                            let _ = app.emit(
                                "docker:changed",
                                json!({
                                    "sessionId": sid,
                                    "type": parsed.get("Type").or_else(|| parsed.get("type")).cloned().unwrap_or(Value::Null),
                                    "action": parsed.get("Action").or_else(|| parsed.get("action")).cloned().unwrap_or(Value::Null),
                                    "raw": parsed,
                                }),
                            );
                        }
                    }
                    Some(ChannelMsg::Eof) | None => break,
                    _ => {}
                }
            }
        });
        Ok(())
    }
}
