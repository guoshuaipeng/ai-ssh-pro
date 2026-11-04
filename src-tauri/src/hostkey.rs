use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tokio::sync::oneshot;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyPromptEvent {
    pub request_id: String,
    pub host: String,
    pub port: u16,
    pub fingerprint: String,
    pub reason: String,
    pub previous_fingerprint: Option<String>,
    pub key_type: Option<String>,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct HostKeyDecision {
    pub accept: bool,
    pub always_trust: bool,
}

pub struct HostKeyWaiters {
    inner: Mutex<HashMap<String, oneshot::Sender<HostKeyDecision>>>,
}

impl HostKeyWaiters {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(HashMap::new()),
        }
    }

    pub fn register(&self) -> (String, oneshot::Receiver<HostKeyDecision>) {
        let id = Uuid::new_v4().to_string();
        let (tx, rx) = oneshot::channel();
        self.inner.lock().insert(id.clone(), tx);
        (id, rx)
    }

    pub fn resolve(&self, request_id: &str, accept: bool, always_trust: bool) -> bool {
        if let Some(tx) = self.inner.lock().remove(request_id) {
            let _ = tx.send(HostKeyDecision {
                accept,
                always_trust,
            });
            true
        } else {
            false
        }
    }

    pub fn cancel(&self, request_id: &str) {
        let _ = self.inner.lock().remove(request_id);
    }
}

