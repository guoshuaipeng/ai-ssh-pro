from pathlib import Path
p = Path("src-tauri/src/ssh.rs")
t = p.read_text(encoding="utf-8")

# Add probe fields to SshConnectOptions
if "probe_only" not in t:
    old = '''    /// When false, do not park/reuse jump slots (default true).
    pub jump_retry_from_failed_hop: Option<bool>,
}'''
    new = '''    /// When false, do not park/reuse jump slots (default true).
    pub jump_retry_from_failed_hop: Option<bool>,
    /// Health-probe short connection: authenticate only, no PTY/shell.
    pub probe_only: Option<bool>,
    /// Key for the held probe pool (usually profileId).
    pub probe_profile_id: Option<String>,
}'''
    if old not in t:
        raise SystemExit("opts block missing")
    t = t.replace(old, new, 1)

# Add ProbeHeld + map on SshManager
if "struct ProbeHeld" not in t:
    old = '''struct JumpSlot {
    handles: Vec<Arc<AsyncMutex<Handle<ClientHandler>>>>,
    at: i64,
}

pub struct SshManager {
    sessions: AsyncMutex<HashMap<String, Arc<LiveSession>>>,
    known: Arc<KnownHostsStore>,
    waiters: Arc<HostKeyWaiters>,
    forwards: Arc<ForwardManager>,
    remote_routes: Arc<RemoteForwardRouter>,
    /// Successful jump hop handles parked after a later hop failed (Electron jumpSlots).
    jump_slots: Mutex<HashMap<String, JumpSlot>>,
}'''
    new = '''struct JumpSlot {
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
}'''
    if old not in t:
        raise SystemExit("SshManager block missing")
    t = t.replace(old, new, 1)
    t = t.replace(
        '''            jump_slots: Mutex::new(HashMap::new()),
        }
    }''',
        '''            jump_slots: Mutex::new(HashMap::new()),
            probe_held: AsyncMutex::new(HashMap::new()),
        }
    }''',
        1,
    )

# After handle = Arc::new..., before channel open — branch probe_only
marker = '''        let handle = Arc::new(AsyncMutex::new(handle));
        let channel = handle.lock().await.channel_open_session().await.context("open session")?;'''
if "probe_only.unwrap_or(false)" not in t:
    replacement = '''        let handle = Arc::new(AsyncMutex::new(handle));
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
        let channel = handle.lock().await.channel_open_session().await.context("open session")?;'''
    if marker not in t:
        raise SystemExit("channel open marker missing")
    t = t.replace(marker, replacement, 1)

# Patch exec to also try probe_held — find start of exec
old_exec_lookup = '''        let map = self.sessions.lock().await;
        let live = map
            .get(session_id)
            .ok_or_else(|| anyhow!("session not found"))?
            .clone();
        drop(map);

        let mut channel = live
            .handle
            .lock()
            .await
            .channel_open_session()
            .await
            .context("open exec channel")?;
        channel.exec(true, command).await.context("exec")?;'''

# Only replace the FIRST occurrence in exec function - need uniqueness. Check how many times.
count = t.count(old_exec_lookup)
print("exec lookup count", count)

# Add probe_exec / sweep / release methods before end of impl - find a unique spot after pub async fn exec's closing
# Simpler: enhance exec to check probe_held first via a helper at the start of exec

new_exec_lookup = '''        let handle = {
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
        channel.exec(true, command).await.context("exec")?;'''

if count >= 1 and "probe_held.lock().await" not in t.split("pub async fn exec")[1][:800]:
    t = t.replace(old_exec_lookup, new_exec_lookup, 1)

# Append probe sweep/release methods - find "pub async fn add_forward"
if "pub async fn probe_sweep" not in t:
    methods = '''
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

'''
    anchor = "    pub async fn add_forward("
    if anchor not in t:
        raise SystemExit("add_forward missing")
    t = t.replace(anchor, methods + anchor, 1)

# Ensure json! imported - ssh.rs already uses json!
p.write_text(t, encoding="utf-8")
print("ssh probe pool patched")
