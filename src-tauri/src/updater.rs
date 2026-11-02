//! Update *check* against public manifests (site / GitHub). In-app install remains gated on
//! code-signing + tauri-plugin-updater endpoints — see MIGRATION-TAURI.md.
use serde_json::{json, Value};

const SITE_LATEST: &str = "https://guoshuaipeng.github.io/ai-ssh-pro/latest.json";
const GITHUB_LATEST: &str =
    "https://api.github.com/repos/guoshuaipeng/ai-ssh-pro/releases/latest";
const GITHUB_RELEASES: &str = "https://github.com/guoshuaipeng/ai-ssh-pro/releases";

fn parse_semver(s: &str) -> Option<(u64, u64, u64)> {
    let t = s.trim().trim_start_matches('v');
    let mut parts = t.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next().unwrap_or("0").parse().unwrap_or(0);
    let patch = parts
        .next()
        .unwrap_or("0")
        .split(|c: char| !c.is_ascii_digit())
        .next()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);
    Some((major, minor, patch))
}

fn cmp_semver(a: &str, b: &str) -> i32 {
    match (parse_semver(a), parse_semver(b)) {
        (Some(x), Some(y)) => {
            if x < y {
                -1
            } else if x > y {
                1
            } else {
                0
            }
        }
        _ => 0,
    }
}

async fn fetch_json(url: &str) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .user_agent("ai-ssh-pro")
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .get(url)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

fn from_site(v: &Value, current: &str) -> Option<Value> {
    let latest = v
        .get("version")
        .or_else(|| v.get("latestVersion"))
        .and_then(|x| x.as_str())?;
    let has = cmp_semver(current, latest) < 0;
    Some(json!({
        "currentVersion": current,
        "status": if has { "available" } else { "up-to-date" },
        "latestVersion": latest,
        "releaseUrl": v.get("releaseUrl").cloned().unwrap_or(json!(GITHUB_RELEASES)),
        "downloadUrl": v.get("downloadUrl").or_else(|| v.get("url")).cloned(),
        "releaseName": v.get("name").cloned(),
        "notes": v.get("notes").or_else(|| v.get("body")).cloned(),
        "message": if has { "update-available" } else { "up-to-date" },
        "source": "site",
        "channel": "auto",
        "installDeferred": true,
        "installReason": "自动安装需代码签名与 tauri-plugin-updater 发布端点；当前仅检查并给出下载链接",
        "hasUpdate": has,
        "ok": true,
    }))
}

fn from_github(v: &Value, current: &str) -> Option<Value> {
    let tag = v.get("tag_name").and_then(|x| x.as_str())?;
    let latest = tag.trim_start_matches('v');
    let has = cmp_semver(current, latest) < 0;
    let download = v
        .get("assets")
        .and_then(|a| a.as_array())
        .and_then(|arr| {
            arr.iter().find_map(|a| {
                let name = a.get("name").and_then(|n| n.as_str()).unwrap_or("");
                if name.ends_with(".exe") || name.ends_with(".msi") {
                    a.get("browser_download_url").cloned()
                } else {
                    None
                }
            })
        });
    Some(json!({
        "currentVersion": current,
        "status": if has { "available" } else { "up-to-date" },
        "latestVersion": latest,
        "releaseUrl": v.get("html_url").cloned().unwrap_or(json!(GITHUB_RELEASES)),
        "downloadUrl": download,
        "releaseName": v.get("name").cloned(),
        "notes": v.get("body").cloned(),
        "message": if has { "update-available" } else { "up-to-date" },
        "source": "github",
        "channel": "github",
        "installDeferred": true,
        "installReason": "自动安装需代码签名与 tauri-plugin-updater 发布端点；当前仅检查并给出下载链接",
        "hasUpdate": has,
        "ok": true,
    }))
}

pub async fn check_update(opts: Option<Value>) -> Value {
    let current = env!("CARGO_PKG_VERSION");
    let channel = opts
        .as_ref()
        .and_then(|o| o.get("channel"))
        .and_then(|v| v.as_str())
        .unwrap_or("auto");
    let custom = opts
        .as_ref()
        .and_then(|o| o.get("customUrl"))
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());

    let mut tried = Vec::new();
    if channel == "custom" {
        if let Some(url) = custom {
            tried.push("custom");
            match fetch_json(url).await {
                Ok(v) => {
                    if let Some(r) = from_site(&v, current) {
                        let mut r = r;
                        r.as_object_mut().unwrap().insert("source".into(), json!("custom"));
                        r.as_object_mut().unwrap().insert("channel".into(), json!("custom"));
                        r.as_object_mut().unwrap().insert("tried".into(), json!(tried));
                        return r;
                    }
                }
                Err(e) => {
                    return json!({
                        "ok": false,
                        "currentVersion": current,
                        "status": "error",
                        "message": e,
                        "installDeferred": true,
                        "tried": tried,
                    });
                }
            }
        }
    }

    if channel == "auto" || channel == "github" || channel == "custom" {
        if channel == "auto" {
            tried.push("site");
            if let Ok(v) = fetch_json(SITE_LATEST).await {
                if let Some(mut r) = from_site(&v, current) {
                    r.as_object_mut().unwrap().insert("tried".into(), json!(tried));
                    return r;
                }
            }
        }
        tried.push("github");
        match fetch_json(GITHUB_LATEST).await {
            Ok(v) => {
                if let Some(mut r) = from_github(&v, current) {
                    r.as_object_mut().unwrap().insert("tried".into(), json!(tried));
                    if channel == "auto" {
                        r.as_object_mut().unwrap().insert("fellBack".into(), json!(true));
                    }
                    return r;
                }
            }
            Err(e) => {
                return json!({
                    "ok": false,
                    "currentVersion": current,
                    "status": "error",
                    "message": e,
                    "installDeferred": true,
                    "releaseUrl": GITHUB_RELEASES,
                    "tried": tried,
                });
            }
        }
    }

    json!({
        "ok": false,
        "currentVersion": current,
        "status": "error",
        "message": "no-update-source",
        "installDeferred": true,
        "releaseUrl": GITHUB_RELEASES,
        "tried": tried,
    })
}
