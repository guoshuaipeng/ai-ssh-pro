//! Per-hop jump-chain probe (Electron jump-probe.ts port). Stops at first failure.
use anyhow::{anyhow, Context, Result};
use russh::client::{self, Handle};
use russh::keys::{load_secret_key, PrivateKeyWithHashAlg, PublicKey};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;
use tokio::sync::Mutex as AsyncMutex;

use crate::known_hosts::{public_key_wire_bytes, HostKeyCheck, KnownHostsStore};
use tauri::{AppHandle, Emitter};
use crate::ssh::{JumpHop, SshConnectOptions};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HopProbeRow {
    pub hop: u32,
    pub total: u32,
    pub name: String,
    pub addr: String,
    pub ok: bool,
    pub ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

struct ProbeHandler {
    host: String,
    port: u16,
    known: Arc<KnownHostsStore>,
    deny_reason: Arc<AsyncMutex<Option<String>>>,
}

impl client::Handler for ProbeHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        let bytes = match public_key_wire_bytes(server_public_key) {
            Ok(b) => b,
            Err(_) => {
                *self.deny_reason.lock().await =
                    Some("无法解析主机密钥".into());
                return Ok(false);
            }
        };
        match self.known.check(&self.host, self.port, &bytes) {
            HostKeyCheck::Trusted => Ok(true),
            HostKeyCheck::Unknown { .. } => {
                *self.deny_reason.lock().await = Some(
                    "主机密钥未信任（探测不会弹窗；请先正常连接并信任后再探测）".into(),
                );
                Ok(false)
            }
            HostKeyCheck::Changed { .. } => {
                *self.deny_reason.lock().await = Some(
                    "主机密钥已变更（探测拒绝；请在 known_hosts 中确认）".into(),
                );
                Ok(false)
            }
        }
    }
}

async fn auth_handle(
    handle: &mut Handle<ProbeHandler>,
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
            let path =
                private_key_path.ok_or_else(|| anyhow!("privateKeyPath required"))?;
            let key_pair = load_secret_key(PathBuf::from(path), passphrase)
                .with_context(|| format!("load key {path}"))?;
            let hash = handle.best_supported_rsa_hash().await?.flatten();
            handle
                .authenticate_publickey(
                    username.to_string(),
                    PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash),
                )
                .await?
                .success()
        }
        "agent" => crate::ssh::SshManager::authenticate_with_agent(handle, username, agent_socket).await?,
        _ => {
            let password = password.ok_or_else(|| anyhow!("password required"))?;
            handle
                .authenticate_password(username.to_string(), password)
                .await?
                .success()
        }
    };
    if !ok {
        return Err(anyhow!("authentication failed"));
    }
    Ok(())
}

pub async fn probe_jump_chain(
    app: Option<AppHandle>,
    known: Arc<KnownHostsStore>,
    opts: SshConnectOptions,
) -> Result<Vec<HopProbeRow>> {
    let timeout = std::time::Duration::from_millis(
        opts.timeout_ms.unwrap_or(8_000).max(1_000) as u64,
    );
    let hops = opts.jump_chain.clone().unwrap_or_default();
    let hops: Vec<JumpHop> = hops.into_iter().take(5).collect();
    let target_host = opts.host.clone();
    let target_port = opts.port.unwrap_or(22);
    let target_user = opts.username.clone();

    #[derive(Clone)]
    struct Step {
        hop: Option<JumpHop>,
        host: String,
        port: u16,
        username: String,
        name: String,
    }

    let mut steps: Vec<Step> = hops
        .iter()
        .map(|h| Step {
            name: h
                .label
                .clone()
                .unwrap_or_else(|| h.host.clone()),
            host: h.host.clone(),
            port: h.port.unwrap_or(22),
            username: h.username.clone(),
            hop: Some(h.clone()),
        })
        .collect();
    steps.push(Step {
        hop: None,
        host: target_host,
        port: target_port,
        username: target_user,
        name: opts.host.clone(),
    });

    let total = steps.len() as u32;
    let mut rows = Vec::new();
    let config = Arc::new(client::Config {
        inactivity_timeout: Some(timeout),
        ..Default::default()
    });

    let mut prev_handle: Option<Handle<ProbeHandler>> = None;

    for (i, step) in steps.iter().enumerate() {
        if let Some(app) = &app {
            let _ = app.emit(
                "ssh:hop",
                json!({
                    "hop": (i + 1) as u32,
                    "total": total,
                    "name": step.name,
                    "addr": format!("{}:{}", step.host, step.port),
                    "phase": "probing",
                }),
            );
            let _ = app.emit(
                "ssh:stage",
                json!({
                    "stage": "probe",
                    "hop": (i + 1) as u32,
                    "total": total,
                    "name": step.name,
                    "message": format!("probing {}:{}", step.host, step.port),
                }),
            );
        }
        let started = Instant::now();
        let deny = Arc::new(AsyncMutex::new(None));
        let handler = ProbeHandler {
            host: step.host.clone(),
            port: step.port,
            known: known.clone(),
            deny_reason: deny.clone(),
        };

        let connect_result = async {
            let mut handle = if let Some(prev) = prev_handle.as_mut() {
                let channel = prev
                    .channel_open_direct_tcpip(
                        step.host.clone(),
                        step.port as u32,
                        "127.0.0.1".to_string(),
                        0,
                    )
                    .await
                    .context("forwardOut")?;
                client::connect_stream(config.clone(), channel.into_stream(), handler)
                    .await
                    .context("connect_stream")?
            } else {
                client::connect(config.clone(), (step.host.as_str(), step.port), handler)
                    .await
                    .with_context(|| format!("connect {}:{}", step.host, step.port))?
            };

            if let Some(hop) = &step.hop {
                auth_handle(
                    &mut handle,
                    &step.username,
                    hop.password.as_deref(),
                    hop.private_key_path.as_deref(),
                    hop.passphrase.as_deref(),
                    hop.auth.as_deref(),
                    opts.agent_socket.as_deref(),
                )
                .await?;
            } else {
                auth_handle(
                    &mut handle,
                    &step.username,
                    opts.password.as_deref(),
                    opts.private_key_path.as_deref(),
                    opts.passphrase.as_deref(),
                    opts.auth_mode.as_deref(),
                    opts.agent_socket.as_deref(),
                )
                .await?;
            }
            Ok::<_, anyhow::Error>(handle)
        };

        match tokio::time::timeout(timeout, connect_result).await {
            Ok(Ok(handle)) => {
                rows.push(HopProbeRow {
                    hop: (i + 1) as u32,
                    total,
                    name: step.name.clone(),
                    addr: format!("{}:{}", step.host, step.port),
                    ok: true,
                    ms: started.elapsed().as_millis() as u64,
                    reason: None,
                });
                prev_handle = Some(handle);
            }
            Ok(Err(e)) => {
                let reason = deny
                    .lock()
                    .await
                    .clone()
                    .unwrap_or_else(|| format!("{e:#}"));
                rows.push(HopProbeRow {
                    hop: (i + 1) as u32,
                    total,
                    name: step.name.clone(),
                    addr: format!("{}:{}", step.host, step.port),
                    ok: false,
                    ms: started.elapsed().as_millis() as u64,
                    reason: Some(reason),
                });
                break;
            }
            Err(_) => {
                let reason = deny
                    .lock()
                    .await
                    .clone()
                    .unwrap_or_else(|| "timeout".into());
                rows.push(HopProbeRow {
                    hop: (i + 1) as u32,
                    total,
                    name: step.name.clone(),
                    addr: format!("{}:{}", step.host, step.port),
                    ok: false,
                    ms: started.elapsed().as_millis() as u64,
                    reason: Some(reason),
                });
                break;
            }
        }
    }

    // Drop handles — disconnect
    drop(prev_handle);
    Ok(rows)
}

pub fn probe_to_value(rows: Vec<HopProbeRow>) -> Value {
    json!(rows)
}
