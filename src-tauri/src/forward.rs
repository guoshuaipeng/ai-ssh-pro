use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::net::TcpListener;
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use russh::client::Handle;

use crate::ssh::ClientHandler;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForwardSpec {
    pub direction: Option<String>,
    pub local_host: Option<String>,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveForward {
    pub id: String,
    pub session_id: String,
    pub source: String,
    pub direction: String,
    pub local_host: Option<String>,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    pub status: String,
    pub last_error: Option<String>,
    pub connections: u64,
    pub total_connections: u64,
    pub bytes_in: u64,
    pub bytes_out: u64,
}

struct LiveForward {
    info: Mutex<ActiveForward>,
    stop: tokio::sync::watch::Sender<bool>,
}

pub struct ForwardManager {
    forwards: AsyncMutex<HashMap<String, Arc<LiveForward>>>,
}

impl ForwardManager {
    pub fn new() -> Self {
        Self {
            forwards: AsyncMutex::new(HashMap::new()),
        }
    }

    pub async fn list(&self, session_id: Option<&str>) -> Vec<ActiveForward> {
        let map = self.forwards.lock().await;
        map.values()
            .filter(|f| session_id.map(|s| f.info.lock().session_id == s).unwrap_or(true))
            .map(|f| f.info.lock().clone())
            .collect()
    }

    pub async fn remove(&self, id: &str) -> bool {
        let mut map = self.forwards.lock().await;
        if let Some(f) = map.remove(id) {
            let _ = f.stop.send(true);
            true
        } else {
            false
        }
    }

    pub async fn stop_session(&self, session_id: &str) -> u64 {
        let mut map = self.forwards.lock().await;
        let ids: Vec<String> = map
            .iter()
            .filter(|(_, f)| f.info.lock().session_id == session_id)
            .map(|(id, _)| id.clone())
            .collect();
        let n = ids.len() as u64;
        for id in ids {
            if let Some(f) = map.remove(&id) {
                let _ = f.stop.send(true);
            }
        }
        n
    }

    pub async fn start_local(
        &self,
        session_id: String,
        handle: std::sync::Arc<Handle<ClientHandler>>,
        spec: ForwardSpec,
        source: &str,
    ) -> Result<ActiveForward> {
        let direction = spec.direction.clone().unwrap_or_else(|| "L".into());
        if direction != "L" {
            return Err(anyhow!("only local (L) forwards are implemented in Tauri build"));
        }
        let bind_host = spec.local_host.clone().unwrap_or_else(|| "127.0.0.1".into());
        let listener = TcpListener::bind((bind_host.as_str(), spec.local_port))
            .await
            .with_context(|| format!("bind {}:{}", bind_host, spec.local_port))?;
        let local_port = listener.local_addr()?.port();

        let id = Uuid::new_v4().to_string();
        let info = ActiveForward {
            id: id.clone(),
            session_id: session_id.clone(),
            source: source.into(),
            direction: "L".into(),
            local_host: Some(bind_host),
            local_port,
            remote_host: spec.remote_host.clone(),
            remote_port: spec.remote_port,
            status: "listening".into(),
            last_error: None,
            connections: 0,
            total_connections: 0,
            bytes_in: 0,
            bytes_out: 0,
        };

        let (stop_tx, stop_rx) = tokio::sync::watch::channel(false);
        let live = Arc::new(LiveForward {
            info: Mutex::new(info.clone()),
            stop: stop_tx,
        });
        {
            let mut map = self.forwards.lock().await;
            map.insert(id.clone(), live.clone());
        }

        let live2 = live.clone();
        let remote_host = spec.remote_host;
        let remote_port = spec.remote_port;
        tokio::spawn(async move {
            let mut stop_rx = stop_rx;
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() { break; }
                    }
                    acc = listener.accept() => {
                        match acc {
                            Ok((mut sock, _)) => {
                                {
                                    let mut info = live2.info.lock();
                                    info.connections += 1;
                                    info.total_connections += 1;
                                }
                                let handle = std::sync::Arc::clone(&handle);
                                let live3 = live2.clone();
                                let rh = remote_host.clone();
                                tokio::spawn(async move {
                                    let channel = match handle.as_ref().channel_open_direct_tcpip(
                                        rh,
                                        remote_port as u32,
                                        "127.0.0.1",
                                        0,
                                    ).await {
                                        Ok(c) => c,
                                        Err(e) => {
                                            live3.info.lock().last_error = Some(e.to_string());
                                            live3.info.lock().connections = live3.info.lock().connections.saturating_sub(1);
                                            return;
                                        }
                                    };
                                    let mut stream = channel.into_stream();
                                    let bytes_in = AtomicU64::new(0);
                                    let bytes_out = AtomicU64::new(0);
                                    let res = tokio::io::copy_bidirectional(&mut sock, &mut stream).await;
                                    if let Ok((a, b)) = res {
                                        bytes_out.fetch_add(a, Ordering::Relaxed);
                                        bytes_in.fetch_add(b, Ordering::Relaxed);
                                    }
                                    {
                                        let mut info = live3.info.lock();
                                        info.bytes_out += bytes_out.load(Ordering::Relaxed);
                                        info.bytes_in += bytes_in.load(Ordering::Relaxed);
                                        info.connections = info.connections.saturating_sub(1);
                                    }
                                });
                            }
                            Err(e) => {
                                live2.info.lock().last_error = Some(e.to_string());
                                live2.info.lock().status = "error".into();
                                break;
                            }
                        }
                    }
                }
            }
        });

        let out = live.info.lock().clone();
        Ok(out)
    }
}
