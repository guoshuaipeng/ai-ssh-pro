from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- Cargo.toml deps ---
cargo = (ROOT / "src-tauri/Cargo.toml").read_text(encoding="utf-8")
for dep, line in [
    ("aes-gcm", 'aes-gcm = "0.10"\n'),
    ("scrypt", 'scrypt = "0.11"\n'),
    ("rand", 'rand = "0.8"\n'),
]:
    if dep not in cargo:
        cargo = cargo.replace(
            'bytes = "1"\n',
            f'bytes = "1"\n{line}',
        )
(ROOT / "src-tauri/Cargo.toml").write_text(cargo, encoding="utf-8")
print("Cargo.toml", [d for d in ("aes-gcm","scrypt","rand") if d in cargo])

# --- ssh.rs: append recording on data ---
ssh = (ROOT / "src-tauri/src/ssh.rs").read_text(encoding="utf-8")
if "recording::append_global" not in ssh:
    # after ring update and before emit, append. Do both Data and ExtendedData.
    needle = '''                        {
                            let mut ring = live2.ring.lock();
                            ring.push_str(&chunk);
                            if ring.len() > 200_000 {
                                let keep = ring.len() - 150_000;
                                ring.drain(..keep);
                            }
                        }
                        let _ = app2.emit(
                            "ssh:data",
                            SshDataEvent {
                                session_id: sid.clone(),
                                chunk,
                            },
                        );'''
    repl = '''                        {
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
                        );'''
    if needle not in ssh:
        raise SystemExit("ssh data needle not found")
    ssh = ssh.replace(needle, repl, 1)
    # ExtendedData path - usually no ring
    needle2 = '''                    Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                        let chunk = String::from_utf8_lossy(data).to_string();
                        let _ = app2.emit(
                            "ssh:data",
                            SshDataEvent {
                                session_id: sid.clone(),
                                chunk,
                            },
                        );
                    }'''
    repl2 = '''                    Some(ChannelMsg::ExtendedData { ref data, .. }) => {
                        let chunk = String::from_utf8_lossy(data).to_string();
                        crate::recording::append_global(&sid, &chunk);
                        let _ = app2.emit(
                            "ssh:data",
                            SshDataEvent {
                                session_id: sid.clone(),
                                chunk,
                            },
                        );
                    }'''
    if needle2 in ssh:
        ssh = ssh.replace(needle2, repl2, 1)
        print("ssh ExtendedData hooked")
    else:
        print("WARN: ExtendedData needle missing")
    (ROOT / "src-tauri/src/ssh.rs").write_text(ssh, encoding="utf-8")
    print("ssh recording hooked")
else:
    print("ssh already hooked")

# --- local_shell.rs ---
ls = (ROOT / "src-tauri/src/local_shell.rs").read_text(encoding="utf-8")
if "recording::append_global" not in ls:
    needle = '''                        let _ = app2.emit(
                            "ssh:data",
                            SshDataEvent {
                                session_id: sid.clone(),
                                chunk,
                            },
                        );'''
    # may use different struct - check
    if needle not in ls:
        # try without SshDataEvent type name variations
        idx = ls.find('app2.emit(\n                            "ssh:data"')
        if idx < 0:
            idx = ls.find('"ssh:data"')
        print("local_shell emit context:")
        print(ls[max(0,idx-200):idx+250])
        raise SystemExit("local_shell needle not found")
    repl = '''                        crate::recording::append_global(&sid, &chunk);
                        let _ = app2.emit(
                            "ssh:data",
                            SshDataEvent {
                                session_id: sid.clone(),
                                chunk,
                            },
                        );'''
    ls = ls.replace(needle, repl, 1)
    (ROOT / "src-tauri/src/local_shell.rs").write_text(ls, encoding="utf-8")
    print("local_shell hooked")
else:
    print("local_shell already hooked")

print("part4a done")