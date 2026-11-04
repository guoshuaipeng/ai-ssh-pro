from pathlib import Path
p = Path("src-tauri/src/ssh.rs")
t = p.read_text(encoding="utf-8")

# --- SshConnectOptions fields ---
old_opts = """    /// Up to five ProxyJump hops (replaces jumpHost when set)
    pub jump_chain: Option<Vec<JumpHop>>,
}"""
new_opts = """    /// Up to five ProxyJump hops (replaces jumpHost when set)
    pub jump_chain: Option<Vec<JumpHop>>,
    /// Forward local SSH agent to the *target* only (never jump hops).
    pub agent_forward: Option<bool>,
    /// Override agent socket / named pipe (default: SSH_AUTH_SOCK or Windows OpenSSH pipe).
    pub agent_socket: Option<String>,
    /// Used by probeJump (milliseconds).
    pub timeout_ms: Option<u64>,
}"""
if "agent_forward:" not in t:
    assert old_opts in t
    t = t.replace(old_opts, new_opts)

# --- JumpHop auth field if missing ---
if "pub struct JumpHop" in t and "pub auth:" not in t[t.find("pub struct JumpHop"):t.find("pub struct JumpHop")+400]:
    t = t.replace(
        """pub struct JumpHop {
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub label: Option<String>,
}""",
        """pub struct JumpHop {
    pub host: String,
    pub port: Option<u16>,
    pub username: String,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    pub label: Option<String>,
    pub auth: Option<String>,
}""",
    )

# --- ClientHandler agent_socket ---
old_h = """pub struct ClientHandler {
    pub host: String,
    pub port: u16,
    pub app: AppHandle,
    pub known: Arc<KnownHostsStore>,
    pub waiters: Arc<HostKeyWaiters>,
    pub remote_routes: Arc<RemoteForwardRouter>,
}"""
new_h = """pub struct ClientHandler {
    pub host: String,
    pub port: u16,
    pub app: AppHandle,
    pub known: Arc<KnownHostsStore>,
    pub waiters: Arc<HostKeyWaiters>,
    pub remote_routes: Arc<RemoteForwardRouter>,
    /// When Some, accept auth-agent@openssh.com and proxy to this local agent path.
    pub agent_socket: Option<String>,
}"""
if "agent_socket: Option<String>" not in t[t.find("pub struct ClientHandler"):t.find("pub struct ClientHandler")+500]:
    assert old_h in t
    t = t.replace(old_h, new_h)

# make_handler
old_mh = """    fn make_handler(&self, app: &AppHandle, host: &str, port: u16) -> ClientHandler {
        ClientHandler {
            host: host.to_string(),
            port,
            app: app.clone(),
            known: self.known.clone(),
            waiters: self.waiters.clone(),
            remote_routes: self.remote_routes.clone(),
        }
    }"""
new_mh = """    fn make_handler(
        &self,
        app: &AppHandle,
        host: &str,
        port: u16,
        agent_socket: Option<String>,
    ) -> ClientHandler {
        ClientHandler {
            host: host.to_string(),
            port,
            app: app.clone(),
            known: self.known.clone(),
            waiters: self.waiters.clone(),
            remote_routes: self.remote_routes.clone(),
            agent_socket,
        }
    }"""
if "agent_socket," not in t[t.find("fn make_handler"):t.find("fn make_handler")+500]:
    assert old_mh in t, "make_handler missing"
    t = t.replace(old_mh, new_mh)

# Update all make_handler call sites - jump hops: None, target: maybe forward socket
# First replace simple 3-arg calls carefully via counting
# make_handler(&app, &opts.host, port) -> with agent if forward
# For hop connections use None

# Add default_agent_socket + authenticate_with_agent before authenticate_handle
helper = '''
    pub fn default_agent_socket(override_sock: Option<&str>) -> Option<String> {
        if let Some(s) = override_sock.map(|s| s.trim()).filter(|s| !s.is_empty()) {
            return Some(s.to_string());
        }
        if let Ok(s) = std::env::var("SSH_AUTH_SOCK") {
            let s = s.trim().to_string();
            if !s.is_empty() {
                return Some(s);
            }
        }
        #[cfg(windows)]
        {
            return Some(r"\\\\.\\pipe\\openssh-ssh-agent".into());
        }
        #[cfg(not(windows))]
        {
            None
        }
    }

    /// Authenticate via local SSH agent (Windows named pipe / Unix SSH_AUTH_SOCK).
    pub async fn authenticate_with_agent<H: client::Handler + Send + 'static>(
        handle: &mut Handle<H>,
        username: &str,
        agent_socket: Option<&str>,
    ) -> Result<bool>
    where
        H::Error: From<russh::Error> + Send,
    {
        use russh::keys::agent::client::AgentClient;
        let sock = Self::default_agent_socket(agent_socket)
            .ok_or_else(|| anyhow!("未找到本机 SSH Agent（SSH_AUTH_SOCK / OpenSSH Authentication Agent）"))?;
        #[cfg(windows)]
        let mut agent = AgentClient::connect_named_pipe(&sock)
            .await
            .map_err(|e| anyhow!("连接 SSH Agent 失败 ({sock}): {e}"))?;
        #[cfg(not(windows))]
        let mut agent = AgentClient::connect_uds(&sock)
            .await
            .map_err(|e| anyhow!("连接 SSH Agent 失败 ({sock}): {e}"))?;
        let identities = agent
            .request_identities()
            .await
            .map_err(|e| anyhow!("列出 Agent 身份失败: {e}"))?;
        if identities.is_empty() {
            return Err(anyhow!("SSH Agent 中没有可用密钥"));
        }
        let hash = handle.best_supported_rsa_hash().await?.flatten();
        for identity in identities {
            let res = handle
                .authenticate_publickey_with(username.to_string(), identity, hash, &mut agent)
                .await
                .map_err(|e| anyhow!("agent auth: {e}"))?;
            if res.success() {
                return Ok(true);
            }
        }
        Ok(false)
    }

'''

if "authenticate_with_agent" not in t:
    t = t.replace(
        "    async fn authenticate_handle(",
        helper + "    async fn authenticate_handle(",
    )

# Extend authenticate_handle signature with agent_socket and agent mode
old_auth = """    async fn authenticate_handle(
        handle: &mut Handle<ClientHandler>,
        username: &str,
        password: Option<&str>,
        private_key_path: Option<&str>,
        passphrase: Option<&str>,
        auth_mode: Option<&str>,
    ) -> Result<()> {
        let mode = auth_mode.unwrap_or_else(|| {
            if private_key_path.map(|s| !s.is_empty()).unwrap_or(false) {
                "key"
            } else {
                "password"
            }
        });
        let ok = match mode {
            "key" => {
                let path = private_key_path
                    .ok_or_else(|| anyhow!("privateKeyPath required for key auth"))?;
                let key_pair = load_secret_key(PathBuf::from(path), passphrase)
                    .with_context(|| format!("load private key {path}"))?;
                let hash = handle.best_supported_rsa_hash().await?.flatten();
                let auth_res = handle
                    .authenticate_publickey(
                        username.to_string(),
                        PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash),
                    )
                    .await
                    .context("publickey auth")?;
                auth_res.success()
            }
            _ => {
                let password =
                    password.ok_or_else(|| anyhow!("password required for password auth"))?;
                let auth_res = handle
                    .authenticate_password(username.to_string(), password)
                    .await
                    .context("password auth")?;
                auth_res.success()
            }
        };
        if !ok {
            return Err(anyhow!("authentication failed for {username}"));
        }
        Ok(())
    }"""

new_auth = """    async fn authenticate_handle(
        handle: &mut Handle<ClientHandler>,
        username: &str,
        password: Option<&str>,
        private_key_path: Option<&str>,
        passphrase: Option<&str>,
        auth_mode: Option<&str>,
        agent_socket: Option<&str>,
    ) -> Result<()> {
        let mode = auth_mode.unwrap_or_else(|| {
            if private_key_path.map(|s| !s.is_empty()).unwrap_or(false) {
                "key"
            } else if password.map(|s| !s.is_empty()).unwrap_or(false) {
                "password"
            } else {
                "agent"
            }
        });
        let ok = match mode {
            "key" => {
                let path = private_key_path
                    .ok_or_else(|| anyhow!("privateKeyPath required for key auth"))?;
                let key_pair = load_secret_key(PathBuf::from(path), passphrase)
                    .with_context(|| format!("load private key {path}"))?;
                let hash = handle.best_supported_rsa_hash().await?.flatten();
                let auth_res = handle
                    .authenticate_publickey(
                        username.to_string(),
                        PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash),
                    )
                    .await
                    .context("publickey auth")?;
                auth_res.success()
            }
            "agent" => Self::authenticate_with_agent(handle, username, agent_socket).await?,
            _ => {
                let password =
                    password.ok_or_else(|| anyhow!("password required for password auth"))?;
                let auth_res = handle
                    .authenticate_password(username.to_string(), password)
                    .await
                    .context("password auth")?;
                auth_res.success()
            }
        };
        if !ok {
            return Err(anyhow!("authentication failed for {username}"));
        }
        Ok(())
    }"""

if "agent_socket: Option<&str>,\n    ) -> Result<()>" not in t:
    if old_auth not in t:
        raise SystemExit("authenticate_handle block not found")
    t = t.replace(old_auth, new_auth)

p.write_text(t, encoding="utf-8")
print("ssh partial patch", p.stat().st_size)
