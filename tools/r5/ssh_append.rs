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
        let mut channel = handle
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
