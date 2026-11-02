from pathlib import Path
import re

p = Path("src-tauri/src/ssh.rs")
t = p.read_text(encoding="utf-8")

desired = 'return Some(r"\\\\.\\pipe\\openssh-ssh-agent".into());'
t = re.sub(
    r'return Some\(r"[^"]*openssh-ssh-agent"\.into\(\)\);',
    lambda _m: desired,
    t,
)
m = re.search(r'return Some\(r"[^"]+"', t)
print("pipe:", m.group(0) if m else "missing")

old_direct = """        if hops.is_empty() {
            let handler = self.make_handler(&app, &opts.host, port);
            handle = client::connect(config.clone(), (opts.host.as_str(), port), handler)
                .await
                .with_context(|| format!("connect {}:{}", opts.host, port))?;
            Self::authenticate_handle(
                &mut handle,
                &opts.username,
                opts.password.as_deref(),
                opts.private_key_path.as_deref(),
                opts.passphrase.as_deref(),
                opts.auth_mode.as_deref(),
            )
            .await?;
        } else {"""

fwd_sock = """        let target_agent_sock = if opts.agent_forward.unwrap_or(false) {
            Self::default_agent_socket(opts.agent_socket.as_deref())
        } else {
            None
        };

        if hops.is_empty() {
            let handler = self.make_handler(&app, &opts.host, port, target_agent_sock.clone());
            handle = client::connect(config.clone(), (opts.host.as_str(), port), handler)
                .await
                .with_context(|| format!("connect {}:{}", opts.host, port))?;
            Self::authenticate_handle(
                &mut handle,
                &opts.username,
                opts.password.as_deref(),
                opts.private_key_path.as_deref(),
                opts.passphrase.as_deref(),
                opts.auth_mode.as_deref(),
                opts.agent_socket.as_deref(),
            )
            .await?;
        } else {"""

if "target_agent_sock" not in t:
    if old_direct not in t:
        raise SystemExit("direct connect block not found")
    t = t.replace(old_direct, fwd_sock)
    print("patched direct")
else:
    print("direct already")

t = t.replace(
    "let handler = self.make_handler(&app, h0, *p0);",
    "let handler = self.make_handler(&app, h0, *p0, None);",
)

old_auth0 = """            Self::authenticate_handle(
                &mut cur,
                u0,
                pw0.as_deref(),
                pk0.as_deref(),
                pp0.as_deref(),
                am0.as_deref(),
            )
            .await
            .with_context(|| format!("jump auth {h0}"))?;"""

new_auth0 = """            Self::authenticate_handle(
                &mut cur,
                u0,
                pw0.as_deref(),
                pk0.as_deref(),
                pp0.as_deref(),
                am0.as_deref(),
                None,
            )
            .await
            .with_context(|| format!("jump auth {h0}"))?;"""

if old_auth0 in t:
    t = t.replace(old_auth0, new_auth0)
    print("patched auth0")

old_mid = """                jump_handles.push(Arc::new(AsyncMutex::new(cur)));
                let handler = self.make_handler(&app, nh, *np);
                cur = client::connect_stream(config.clone(), stream, handler)
                    .await
                    .with_context(|| format!("connect via jump to {nh}:{np}"))?;
                Self::authenticate_handle(
                    &mut cur,
                    nu,
                    npw.as_deref(),
                    npk.as_deref(),
                    npp.as_deref(),
                    nam.as_deref(),
                )
                .await
                .with_context(|| format!("auth via jump {nh}"))?;"""

new_mid = """                jump_handles.push(Arc::new(AsyncMutex::new(cur)));
                let is_target = i + 1 == chain.len();
                let hop_agent = if is_target {
                    target_agent_sock.clone()
                } else {
                    None
                };
                let handler = self.make_handler(&app, nh, *np, hop_agent);
                cur = client::connect_stream(config.clone(), stream, handler)
                    .await
                    .with_context(|| format!("connect via jump to {nh}:{np}"))?;
                Self::authenticate_handle(
                    &mut cur,
                    nu,
                    npw.as_deref(),
                    npk.as_deref(),
                    npp.as_deref(),
                    nam.as_deref(),
                    if is_target {
                        opts.agent_socket.as_deref()
                    } else {
                        None
                    },
                )
                .await
                .with_context(|| format!("auth via jump {nh}"))?;"""

if "is_target" not in t:
    if old_mid not in t:
        raise SystemExit("mid hop block not found")
    t = t.replace(old_mid, new_mid)
    print("patched mid")
else:
    print("mid already")

old_shell = """        channel.request_shell(true).await.context("request shell")?;

        let meta = SessionMeta {"""
new_shell = """        channel.request_shell(true).await.context("request shell")?;
        if opts.agent_forward.unwrap_or(false) {
            let _ = channel.agent_forward(true).await;
        }

        let meta = SessionMeta {"""
if "agent_forward(true)" not in t:
    if old_shell not in t:
        raise SystemExit("shell block not found")
    t = t.replace(old_shell, new_shell)
    print("patched shell")

old_fwd = """    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: russh::Channel<Msg>,
        _connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        if let Some(route) = self.remote_routes.take(connected_port) {
            spawn_forwarded_tcpip(channel, route);
        }
        Ok(())
    }
}"""

new_fwd = """    async fn server_channel_open_forwarded_tcpip(
        &mut self,
        channel: russh::Channel<Msg>,
        _connected_address: &str,
        connected_port: u32,
        _originator_address: &str,
        _originator_port: u32,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        if let Some(route) = self.remote_routes.take(connected_port) {
            spawn_forwarded_tcpip(channel, route);
        }
        Ok(())
    }

    async fn server_channel_open_agent_forward(
        &mut self,
        channel: russh::Channel<Msg>,
        _session: &mut client::Session,
    ) -> Result<(), Self::Error> {
        let Some(sock) = self.agent_socket.clone() else {
            return Ok(());
        };
        tokio::spawn(async move {
            if let Err(e) = proxy_agent_channel(channel, sock).await {
                eprintln!("[ssh] agent forward proxy error: {e:#}");
            }
        });
        Ok(())
    }
}

async fn proxy_agent_channel(channel: russh::Channel<Msg>, sock: String) -> anyhow::Result<()> {
    use tokio::io::AsyncWriteExt;
    let mut stream = channel.into_stream();
    #[cfg(windows)]
    {
        let mut pipe = tokio::net::windows::named_pipe::ClientOptions::new()
            .open(std::ffi::OsStr::new(&sock))
            .map_err(|e| anyhow::anyhow!("open agent pipe {sock}: {e}"))?;
        let _ = tokio::io::copy_bidirectional(&mut pipe, &mut stream).await;
        let _ = pipe.shutdown().await;
    }
    #[cfg(not(windows))]
    {
        let mut uds = tokio::net::UnixStream::connect(&sock)
            .await
            .map_err(|e| anyhow::anyhow!("connect agent uds {sock}: {e}"))?;
        let _ = tokio::io::copy_bidirectional(&mut uds, &mut stream).await;
        let _ = uds.shutdown().await;
    }
    Ok(())
}"""

if "server_channel_open_agent_forward" not in t:
    if old_fwd not in t:
        raise SystemExit("forwarded_tcpip block not found")
    t = t.replace(old_fwd, new_fwd)
    print("patched handler")

p.write_text(t, encoding="utf-8")
print("ok", p.stat().st_size)
for line in t.splitlines():
    if "make_handler(" in line:
        print("MH:", line.strip())
