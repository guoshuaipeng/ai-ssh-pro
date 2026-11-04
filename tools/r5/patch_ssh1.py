from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
ssh_path = ROOT / "src-tauri/src/ssh.rs"
ssh = ssh_path.read_text(encoding="utf-8")

old = """pub struct LiveSession {
    pub handle: Arc<AsyncMutex<Handle<ClientHandler>>>,
    /// Intermediate ProxyJump hop handles (kept alive for the tunnel).
    jump_handles: Vec<Arc<AsyncMutex<Handle<ClientHandler>>>>,
    channel: AsyncMutex<russh::Channel<Msg>>,
    pub meta: SessionMeta,
    ring: Mutex<String>,
    remote_routes: Arc<RemoteForwardRouter>,
}"""
new = """pub struct LiveSession {
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
}"""
if "owns_client:" not in ssh:
    if old not in ssh:
        raise SystemExit("LiveSession block not found")
    ssh = ssh.replace(old, new)

oldc = """        let live = Arc::new(LiveSession {
            handle: handle.clone(),
            jump_handles,
            channel: AsyncMutex::new(channel),
            meta: meta.clone(),
            ring: Mutex::new(String::new()),
            remote_routes: self.remote_routes.clone(),
        });"""
newc = """        let live = Arc::new(LiveSession {
            handle: handle.clone(),
            jump_handles,
            channel: AsyncMutex::new(channel),
            meta: meta.clone(),
            ring: Mutex::new(String::new()),
            remote_routes: self.remote_routes.clone(),
            owns_client: true,
            parent_session_id: None,
        });"""
if "owns_client: true" not in ssh:
    if oldc not in ssh:
        raise SystemExit("LiveSession construct not found")
    ssh = ssh.replace(oldc, newc)

oldd = """    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
        let _ = self.forwards.stop_session(session_id).await;
        let mut map = self.sessions.lock().await;
        if let Some(live) = map.remove(session_id) {
            let ch = live.channel.lock().await;
            let _ = ch.close().await;
            {
                let h = live.handle.lock().await;
                let _ = h.disconnect(Disconnect::ByApplication, "", "").await;
            }
            for j in &live.jump_handles {
                let h = j.lock().await;
                let _ = h.disconnect(Disconnect::ByApplication, "", "").await;
            }
        }
        Ok(())
    }"""
newd = """    pub async fn disconnect(&self, session_id: &str) -> Result<()> {
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
    }"""
if "if live.owns_client" not in ssh:
    if oldd not in ssh:
        raise SystemExit("disconnect not found")
    ssh = ssh.replace(oldd, newd)

ssh_path.write_text(ssh, encoding="utf-8")
print("patched LiveSession+disconnect", ssh_path.stat().st_size)