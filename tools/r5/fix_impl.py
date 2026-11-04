from pathlib import Path
p = Path("src-tauri/src/ssh.rs")
t = p.read_text(encoding="utf-8")
# Remove premature closing brace before open_docker_exec
old = """            .await
    }
}
    /// Open an interactive `docker exec`"""
new = """            .await
    }

    /// Open an interactive `docker exec`"""
assert old in t, repr(t[t.find("add_forward"):t.find("add_forward")+400])
t = t.replace(old, new, 1)
# Ensure file ends with closing brace of impl
if not t.rstrip().endswith("}"):
    t = t.rstrip() + "\n}\n"
else:
    # check if last } closes impl - count: we removed one so need one at end
    # The append already ends with methods; add closing }
    # If file already ends with } from last method's block incorrectly...
    pass
# After last method start_docker_events_watch, ensure single closing brace for impl
marker = "        Ok(())\n    }\n"
# find last occurrence of start_docker end
idx = t.rfind("pub async fn start_docker_events_watch")
assert idx > 0
tail = t[idx:]
# ensure after the function there's a closing }
if not tail.rstrip().endswith("}"):
    t = t.rstrip() + "\n}\n"
else:
    # The function ends with `Ok(()); }` then maybe nothing for impl
    # Look at end
    end = t.rstrip()[-80:]
    print("END:", repr(end))
    # If ends with function's closing only once after Ok(())
    if t.rstrip().endswith("Ok(())\n    }"):
        t = t.rstrip() + "\n}\n"
    elif "start_docker_events_watch" in t and t.rstrip().count("\n}") >= 1:
        # check brace balance after impl start roughly
        pass

p.write_text(t, encoding="utf-8")
print("size", p.stat().st_size)
print("tail:\n", t.rstrip()[-200:])
