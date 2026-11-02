use serde_json::{json, Value};
use std::fs;
use std::path::PathBuf;

pub fn data_dir() -> PathBuf {
    let base = dirs::data_dir().unwrap_or_else(|| PathBuf::from("."));
    let dir = base.join("AI-SSH-Pro");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn store_path() -> PathBuf {
    data_dir().join("store.json")
}

pub fn load_store() -> Value {
    let path = store_path();
    match fs::read_to_string(&path) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|_| default_store()),
        Err(_) => default_store(),
    }
}

pub fn save_store(v: &Value) -> Result<(), String> {
    let path = store_path();
    let pretty = serde_json::to_string_pretty(v).map_err(|e| e.to_string())?;
    fs::write(path, pretty).map_err(|e| e.to_string())
}

pub fn default_store() -> Value {
    json!({
        "savedSessions": { "folders": [], "profiles": [] },
        "ai": {
            "providers": [{
                "id": "dashscope",
                "name": "DashScope (OpenAI-compatible)",
                "baseURL": "https://dashscope.aliyuncs.com/compatible-mode/v1",
                "apiKey": "",
                "modelList": ["qwen-max", "qwen-turbo", "qwen-plus"]
            }],
            "activeProviderId": "dashscope",
            "model": "qwen-max",
            "temperature": 0.1,
            "sshParseInstructions": "",
            "useOpenClaw": true
        },
        "terminalPrefs": {
            "fontSize": 14,
            "fontFamily": "Cascadia Mono, Consolas, monospace",
            "cursorBlink": true,
            "scrollback": 5000
        },
        "snippets": [],
        "aiChatHistory": {},
        "aiChatArchive": [],
        "commandHistory": [],
        "recentConnections": [],
        "locale": "zh-CN"
    })
}

pub fn get_path(store: &Value, path: &[&str]) -> Value {
    let mut cur = store;
    for p in path {
        match cur.get(*p) {
            Some(v) => cur = v,
            None => return Value::Null,
        }
    }
    cur.clone()
}

pub fn set_path(store: &mut Value, path: &[&str], value: Value) {
    if path.is_empty() {
        *store = value;
        return;
    }
    let mut cur = store;
    for (i, p) in path.iter().enumerate() {
        if i == path.len() - 1 {
            if let Some(obj) = cur.as_object_mut() {
                obj.insert((*p).to_string(), value);
            }
            return;
        }
        if cur.get(*p).is_none() {
            if let Some(obj) = cur.as_object_mut() {
                obj.insert((*p).to_string(), json!({}));
            }
        }
        cur = cur.get_mut(*p).unwrap();
    }
}
