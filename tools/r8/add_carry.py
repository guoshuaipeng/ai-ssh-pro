from pathlib import Path
p = Path("src-tauri/src/forward.rs")
t = p.read_text(encoding="utf-8")
if "struct CarryStore" in t:
    print("carry already")
    raise SystemExit(0)
insert = '''
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

'''
needle = "pub struct ForwardManager {"
if needle not in t:
    raise SystemExit("ForwardManager not found")
t = t.replace(needle, insert + needle, 1)
t = t.replace(
    "pub struct ForwardManager {\n    forwards: AsyncMutex<HashMap<String, Arc<LiveForward>>>,\n}",
    "pub struct ForwardManager {\n    forwards: AsyncMutex<HashMap<String, Arc<LiveForward>>>,\n    carry: CarryStore,\n}",
    1,
)
t = t.replace(
    "Self {\n            forwards: AsyncMutex::new(HashMap::new()),\n        }",
    "Self {\n            forwards: AsyncMutex::new(HashMap::new()),\n            carry: CarryStore::new(),\n        }",
    1,
)
old_stop = '''    pub async fn stop_session(&self, session_id: &str) -> u64 {
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
                if let (Some((_addr, port)), Some(router)) = (f.remote_bind.clone(), f.router.clone()) {
                    router.unregister(port);
                }
            }
        }
        n
    }'''
new_stop = '''    pub async fn stop_session(&self, session_id: &str) -> u64 {
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
    }'''
if old_stop not in t:
    raise SystemExit("stop_session block not found")
t = t.replace(old_stop, new_stop, 1)
# LiveForward must be Cloneable via Arc - need LiveForward itself? Arc::cloned works without LiveForward: Clone
# But filter uses map.values().cloned() - Arc is Clone. Good.
# However LiveForward is not behind type that requires Clone of inner for Arc clone.
p.write_text(t, encoding="utf-8")
print("forward carry patched")
