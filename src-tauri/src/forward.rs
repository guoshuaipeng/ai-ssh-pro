use anyhow::{anyhow, Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex as AsyncMutex;
use uuid::Uuid;

use russh::client::Handle;
use russh::ChannelMsg;

use crate::ssh::ClientHandler;

pub type SharedHandle = Arc<AsyncMutex<Handle<ClientHandler>>>;

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

#[derive(Clone)]
pub struct RemoteRoute {
    pub local_host: String,
    pub local_port: u16,
    pub info: Arc<Mutex<ActiveForward>>,
}

/// Dispatches server-initiated forwarded-tcpip channels to local sockets.
#[derive(Default)]
pub struct RemoteForwardRouter {
    by_port: Mutex<HashMap<u32, RemoteRoute>>,
}

impl RemoteForwardRouter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn register(&self, remote_port: u32, route: RemoteRoute) {
        self.by_port.lock().insert(remote_port, route);
    }

    pub fn unregister(&self, remote_port: u32) {
        self.by_port.lock().remove(&remote_port);
    }

    pub fn take(&self, remote_port: u32) -> Option<RemoteRoute> {
        self.by_port.lock().get(&remote_port).cloned()
    }
}

struct LiveForward {
    info: Arc<Mutex<ActiveForward>>,
    stop: tokio::sync::watch::Sender<bool>,
    /// For R: remote bind address/port for cancel_tcpip_forward
    remote_bind: Option<(String, u32)>,
    router: Option<Arc<RemoteForwardRouter>>,
}


#[derive(Clone)]
pub struct CarrySpec {
    pub direction: String,
    pub local_host: Option<String>,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

struct CarryEntry {
    at: i64,
    specs: Vec<CarrySpec>,
}

pub struct CarryStore {
    map: Mutex<HashMap<String, CarryEntry>>,
    ttl_ms: i64,
    max: usize,
}

impl CarryStore {
    pub fn new() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
            ttl_ms: 30 * 60_000,
            max: 50,
        }
    }

    fn prune(&self, now: i64) {
        let mut map = self.map.lock();
        map.retain(|_, v| now - v.at <= self.ttl_ms);
    }

    pub fn put(&self, session_id: &str, specs: Vec<CarrySpec>) {
        let now = chrono::Utc::now().timestamp_millis();
        self.prune(now);
        if specs.is_empty() {
            return;
        }
        let mut map = self.map.lock();
        map.insert(
            session_id.to_string(),
            CarryEntry {
                at: now,
                specs,
            },
        );
        while map.len() > self.max {
            if let Some(first) = map.keys().next().cloned() {
                map.remove(&first);
            } else {
                break;
            }
        }
    }

    pub fn take(&self, session_id: &str) -> Vec<CarrySpec> {
        let now = chrono::Utc::now().timestamp_millis();
        self.prune(now);
        let mut map = self.map.lock();
        map.remove(session_id).map(|e| e.specs).unwrap_or_default()
    }
}

pub struct ForwardManager {
    forwards: AsyncMutex<HashMap<String, Arc<LiveForward>>>,
    carry: CarryStore,
}

impl ForwardManager {
    pub fn new() -> Self {
        Self {
            forwards: AsyncMutex::new(HashMap::new()),
            carry: CarryStore::new(),
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
            if let (Some((addr, port)), Some(router)) = (f.remote_bind.clone(), f.router.clone()) {
                router.unregister(port);
                let _ = addr; // cancel happens via stop + optional later
            }
            true
        } else {
            false
        }
    }

    pub async fn stop_session(&self, session_id: &str) -> u64 {
        let mut map = self.forwards.lock().await;
        let mine: Vec<Arc<LiveForward>> = map
            .values()
            .filter(|f| f.info.lock().session_id == session_id)
            .cloned()
            .collect();
        let keep: Vec<CarrySpec> = mine
            .iter()
            .filter_map(|f| {
                let info = f.info.lock();
                if info.source == "manual" && info.status == "listening" {
                    Some(CarrySpec {
                        direction: info.direction.clone(),
                        local_host: info.local_host.clone(),
                        local_port: info.local_port,
                        remote_host: info.remote_host.clone(),
                        remote_port: info.remote_port,
                    })
                } else {
                    None
                }
            })
            .collect();
        if !keep.is_empty() {
            self.carry.put(session_id, keep);
        }
        let ids: Vec<String> = map
            .iter()
            .filter(|(_, f)| f.info.lock().session_id == session_id)
            .map(|(id, _)| id.clone())
            .collect();
        let n = ids.len() as u64;
        for id in ids {
            if let Some(f) = map.remove(&id) {
                let _ = f.stop.send(true);
                if let (Some((_addr, port)), Some(router)) = (f.remote_bind.clone(), f.router.clone()) {
                    router.unregister(port);
                }
            }
        }
        n
    }

    pub fn take_carry(&self, session_id: &str) -> Vec<CarrySpec> {
        self.carry.take(session_id)
    }

    pub async fn start(
        &self,
        session_id: String,
        handle: SharedHandle,
        router: Arc<RemoteForwardRouter>,
        spec: ForwardSpec,
        source: &str,
    ) -> Result<ActiveForward> {
        let direction = spec
            .direction
            .clone()
            .unwrap_or_else(|| "L".into())
            .to_uppercase();
        match direction.as_str() {
            "R" => self.start_remote(session_id, handle, router, spec, source).await,
            "D" => self.start_dynamic(session_id, handle, spec, source).await,
            _ => self.start_local(session_id, handle, spec, source).await,
        }
    }

    pub async fn start_local(
        &self,
        session_id: String,
        handle: SharedHandle,
        spec: ForwardSpec,
        source: &str,
    ) -> Result<ActiveForward> {
        let bind_host = spec
            .local_host
            .clone()
            .unwrap_or_else(|| "127.0.0.1".into());
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
        let info_arc = Arc::new(Mutex::new(info.clone()));
        let live = Arc::new(LiveForward {
            info: info_arc.clone(),
            stop: stop_tx,
            remote_bind: None,
            router: None,
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
                                let handle = Arc::clone(&handle);
                                let live3 = live2.clone();
                                let rh = remote_host.clone();
                                tokio::spawn(async move {
                                    let channel = match handle.lock().await.channel_open_direct_tcpip(
                                        rh,
                                        remote_port as u32,
                                        "127.0.0.1",
                                        0,
                                    ).await {
                                        Ok(c) => c,
                                        Err(e) => {
                                            {
                                                let mut info = live3.info.lock();
                                                info.last_error = Some(e.to_string());
                                                info.connections = info.connections.saturating_sub(1);
                                            }
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
                                let mut info = live2.info.lock();
                                info.last_error = Some(e.to_string());
                                info.status = "error".into();
                                break;
                            }
                        }
                    }
                }
            }
        });

        let out = info_arc.lock().clone();
        Ok(out)
    }

    /// Remote forward (-R): server listens, connections come back as forwarded-tcpip.
    async fn start_remote(
        &self,
        session_id: String,
        handle: SharedHandle,
        router: Arc<RemoteForwardRouter>,
        spec: ForwardSpec,
        source: &str,
    ) -> Result<ActiveForward> {
        let bind_addr = spec
            .remote_host
            .clone();
        let bind_port = spec.remote_port;
        let local_host = spec
            .local_host
            .clone()
            .unwrap_or_else(|| "127.0.0.1".into());
        let local_port = if spec.local_port == 0 {
            return Err(anyhow!("localPort required for remote (R) forward"));
        } else {
            spec.local_port
        };

        let bound = {
            let mut handle_mut = handle.lock().await;
            handle_mut
                .tcpip_forward(bind_addr.clone(), bind_port as u32)
                .await
                .map_err(|e| anyhow!("tcpip-forward rejected: {e}"))?
        };
        let bound_port = if bound == 0 { bind_port as u32 } else { bound };

        let id = Uuid::new_v4().to_string();
        let info = ActiveForward {
            id: id.clone(),
            session_id: session_id.clone(),
            source: source.into(),
            direction: "R".into(),
            local_host: Some(local_host.clone()),
            local_port,
            remote_host: bind_addr.clone(),
            remote_port: bound_port as u16,
            status: "listening".into(),
            last_error: None,
            connections: 0,
            total_connections: 0,
            bytes_in: 0,
            bytes_out: 0,
        };
        let info_arc = Arc::new(Mutex::new(info.clone()));
        router.register(
            bound_port,
            RemoteRoute {
                local_host,
                local_port,
                info: info_arc.clone(),
            },
        );

        let (stop_tx, mut stop_rx) = tokio::sync::watch::channel(false);
        let live = Arc::new(LiveForward {
            info: info_arc.clone(),
            stop: stop_tx,
            remote_bind: Some((bind_addr.clone(), bound_port)),
            router: Some(router.clone()),
        });
        {
            let mut map = self.forwards.lock().await;
            map.insert(id.clone(), live.clone());
        }

        let handle2 = handle.clone();
        let router2 = router.clone();
        tokio::spawn(async move {
            let _ = stop_rx.changed().await;
            router2.unregister(bound_port);
            let h = handle2.lock().await;
            let _ = h.cancel_tcpip_forward(bind_addr, bound_port).await;
            live.info.lock().status = "stopped".into();
        });

        Ok({ let out = info_arc.lock().clone(); out })
    }

    /// Dynamic SOCKS5 (-D): local SOCKS5 proxy over direct-tcpip.
    async fn start_dynamic(
        &self,
        session_id: String,
        handle: SharedHandle,
        spec: ForwardSpec,
        source: &str,
    ) -> Result<ActiveForward> {
        let bind_host = spec
            .local_host
            .clone()
            .unwrap_or_else(|| "127.0.0.1".into());
        let listener = TcpListener::bind((bind_host.as_str(), spec.local_port))
            .await
            .with_context(|| format!("bind socks {}:{}", bind_host, spec.local_port))?;
        let local_port = listener.local_addr()?.port();

        let id = Uuid::new_v4().to_string();
        let info = ActiveForward {
            id: id.clone(),
            session_id: session_id.clone(),
            source: source.into(),
            direction: "D".into(),
            local_host: Some(bind_host),
            local_port,
            remote_host: "socks5".into(),
            remote_port: 0,
            status: "listening".into(),
            last_error: None,
            connections: 0,
            total_connections: 0,
            bytes_in: 0,
            bytes_out: 0,
        };
        let (stop_tx, stop_rx) = tokio::sync::watch::channel(false);
        let info_arc = Arc::new(Mutex::new(info.clone()));
        let live = Arc::new(LiveForward {
            info: info_arc.clone(),
            stop: stop_tx,
            remote_bind: None,
            router: None,
        });
        {
            let mut map = self.forwards.lock().await;
            map.insert(id.clone(), live.clone());
        }

        let live2 = live.clone();
        tokio::spawn(async move {
            let mut stop_rx = stop_rx;
            loop {
                tokio::select! {
                    _ = stop_rx.changed() => {
                        if *stop_rx.borrow() { break; }
                    }
                    acc = listener.accept() => {
                        match acc {
                            Ok((sock, _)) => {
                                {
                                    let mut info = live2.info.lock();
                                    info.connections += 1;
                                    info.total_connections += 1;
                                }
                                let handle = Arc::clone(&handle);
                                let live3 = live2.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = handle_socks5(sock, handle, live3.clone()).await {
                                        live3.info.lock().last_error = Some(e.to_string());
                                    }
                                    live3.info.lock().connections =
                                        live3.info.lock().connections.saturating_sub(1);
                                });
                            }
                            Err(e) => {
                                let mut info = live2.info.lock();
                                info.last_error = Some(e.to_string());
                                info.status = "error".into();
                                break;
                            }
                        }
                    }
                }
            }
        });

        let out = info_arc.lock().clone();
        Ok(out)
    }
}

/// Accept a forwarded-tcpip channel from the SSH server and bridge to local.
pub fn spawn_forwarded_tcpip(channel: russh::Channel<russh::client::Msg>, route: RemoteRoute) {
    tokio::spawn(async move {
        {
            let mut info = route.info.lock();
            info.connections += 1;
            info.total_connections += 1;
        }
        let mut stream = channel.into_stream();
        match TcpStream::connect((route.local_host.as_str(), route.local_port)).await {
            Ok(mut sock) => {
                let res = tokio::io::copy_bidirectional(&mut sock, &mut stream).await;
                if let Ok((a, b)) = res {
                    let mut info = route.info.lock();
                    info.bytes_out += a;
                    info.bytes_in += b;
                }
            }
            Err(e) => {
                route.info.lock().last_error = Some(e.to_string());
                // drain / close channel by dropping stream
                let _ = ChannelMsg::Close;
            }
        }
        route.info.lock().connections = route.info.lock().connections.saturating_sub(1);
    });
}

async fn handle_socks5(
    mut sock: TcpStream,
    handle: SharedHandle,
    live: Arc<LiveForward>,
) -> Result<()> {
    // greeting
    let mut hdr = [0u8; 2];
    sock.read_exact(&mut hdr).await?;
    if hdr[0] != 5 {
        return Err(anyhow!("not socks5"));
    }
    let nmethods = hdr[1] as usize;
    let mut methods = vec![0u8; nmethods];
    if nmethods > 0 {
        sock.read_exact(&mut methods).await?;
    }
    if !methods.contains(&0) && nmethods > 0 {
        sock.write_all(&[5, 0xff]).await?;
        return Err(anyhow!("socks5 auth required"));
    }
    sock.write_all(&[5, 0]).await?;

    // request
    let mut req = [0u8; 4];
    sock.read_exact(&mut req).await?;
    if req[0] != 5 {
        return Err(anyhow!("bad socks ver"));
    }
    if req[1] != 1 {
        // only CONNECT
        sock.write_all(&[5, 7, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
        return Err(anyhow!("socks cmd not supported"));
    }
    let atyp = req[3];
    let host = match atyp {
        1 => {
            let mut ip = [0u8; 4];
            sock.read_exact(&mut ip).await?;
            format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3])
        }
        3 => {
            let mut len = [0u8; 1];
            sock.read_exact(&mut len).await?;
            let mut name = vec![0u8; len[0] as usize];
            sock.read_exact(&mut name).await?;
            String::from_utf8_lossy(&name).to_string()
        }
        4 => {
            let mut ip = [0u8; 16];
            sock.read_exact(&mut ip).await?;
            let parts: Vec<String> = ip
                .chunks(2)
                .map(|c| format!("{:x}", (u16::from(c[0]) << 8) | u16::from(c[1])))
                .collect();
            parts.join(":")
        }
        _ => {
            sock.write_all(&[5, 8, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
            return Err(anyhow!("bad atyp"));
        }
    };
    let mut port_b = [0u8; 2];
    sock.read_exact(&mut port_b).await?;
    let port = u16::from_be_bytes(port_b);

    let channel = match handle
        .lock()
        .await
        .channel_open_direct_tcpip(host.clone(), port as u32, "127.0.0.1", 0)
        .await
    {
        Ok(c) => c,
        Err(e) => {
            sock.write_all(&[5, 5, 0, 1, 0, 0, 0, 0, 0, 0]).await.ok();
            return Err(anyhow!("forwardOut: {e}"));
        }
    };
    // success reply
    sock.write_all(&[5, 0, 0, 1, 0, 0, 0, 0, 0, 0]).await?;
    let mut stream = channel.into_stream();
    let res = tokio::io::copy_bidirectional(&mut sock, &mut stream).await;
    if let Ok((a, b)) = res {
        let mut info = live.info.lock();
        info.bytes_out += a;
        info.bytes_in += b;
    }
    Ok(())
}
