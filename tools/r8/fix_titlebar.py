from pathlib import Path
import json
import re

# --- tauri.conf.json ---
conf_path = Path("src-tauri/tauri.conf.json")
conf = json.loads(conf_path.read_text(encoding="utf-8"))
win = conf["app"]["windows"][0]
win["label"] = "main"
win["decorations"] = False
win["backgroundColor"] = "#161b22"
# keep shadow for Win11 rounded look on undecorated
win["shadow"] = True
conf_path.write_text(json.dumps(conf, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("tauri.conf patched", win)

# --- capabilities ---
cap_path = Path("src-tauri/capabilities/default.json")
cap = json.loads(cap_path.read_text(encoding="utf-8"))
extra = [
    "core:window:allow-close",
    "core:window:allow-minimize",
    "core:window:allow-maximize",
    "core:window:allow-unmaximize",
    "core:window:allow-toggle-maximize",
    "core:window:allow-is-maximized",
    "core:window:allow-start-dragging",
    "core:window:allow-set-focus",
]
perms = cap.setdefault("permissions", [])
for p in extra:
    if p not in perms:
        perms.append(p)
cap_path.write_text(json.dumps(cap, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print("capabilities patched")

# --- WindowControls component ---
Path("src/renderer/src/components/WindowControls.tsx").write_text(
    """import { useCallback, useEffect, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'

/**
 * Custom min / max / close for undecorated Tauri windows (Windows/Linux).
 * Sits in the reserved titlebar padding where Electron titleBarOverlay buttons lived.
 */
export default function WindowControls() {
  const [maximized, setMaximized] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setMaximized(await getCurrentWindow().isMaximized())
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refresh()
    const win = getCurrentWindow()
    let un: (() => void) | undefined
    void win
      .onResized(() => {
        void refresh()
      })
      .then((fn) => {
        un = fn
      })
      .catch(() => {})
    return () => {
      try {
        un?.()
      } catch {
        /* ignore */
      }
    }
  }, [refresh])

  const minimize = () => {
    void getCurrentWindow().minimize().catch(() => {})
  }
  const toggleMax = () => {
    void getCurrentWindow()
      .toggleMaximize()
      .then(() => refresh())
      .catch(() => {})
  }
  const close = () => {
    void getCurrentWindow().close().catch(() => {})
  }

  return (
    <div className="window-controls" role="group" aria-label="Window" data-testid="window-controls">
      <button type="button" className="window-ctrl window-ctrl-min" title="Minimize" aria-label="Minimize" onClick={minimize}>
        <span aria-hidden>—</span>
      </button>
      <button
        type="button"
        className="window-ctrl window-ctrl-max"
        title={maximized ? 'Restore' : 'Maximize'}
        aria-label={maximized ? 'Restore' : 'Maximize'}
        onClick={toggleMax}
      >
        <span aria-hidden>{maximized ? '❐' : '□'}</span>
      </button>
      <button type="button" className="window-ctrl window-ctrl-close" title="Close" aria-label="Close" onClick={close}>
        <span aria-hidden>×</span>
      </button>
    </div>
  )
}
""",
    encoding="utf-8",
)
print("WindowControls written")

# --- AppToolbar: import + render WindowControls ---
tb = Path("src/renderer/src/components/AppToolbar.tsx")
tt = tb.read_text(encoding="utf-8")
if "WindowControls" not in tt:
    tt = tt.replace(
        "import TitlebarMenus, { type TitlebarMenuAction } from './TitlebarMenus'\n",
        "import TitlebarMenus, { type TitlebarMenuAction } from './TitlebarMenus'\nimport WindowControls from './WindowControls'\n",
        1,
    )
    # before closing </header>
    old = """      </div>
    </header>
  )
}
"""
    # more unique - layout pin closing
    if "data-testid=\"window-controls\"" not in tt:
        tt = tt.replace(
            """      </div>
    </header>
  )
}
""",
            """      </div>
      <WindowControls />
    </header>
  )
}
""",
            1,
        )
    # drag region on header
    tt = tt.replace(
        '<header className={`app-titlebar titlebar-compact-${compactLevel}`} ref={headerRef} data-compact={compactLevel}>',
        '<header className={`app-titlebar titlebar-compact-${compactLevel}`} ref={headerRef} data-compact={compactLevel} data-tauri-drag-region>',
        1,
    )
    tb.write_text(tt, encoding="utf-8")
    print("AppToolbar patched")
else:
    print("AppToolbar already has WindowControls")

# --- CSS for window controls ---
css = Path("src/renderer/src/styles.css")
cs = css.read_text(encoding="utf-8")
if ".window-controls" not in cs:
    snippet = """
/* Tauri undecorated: custom window controls in the Electron titleBarOverlay reserve */
.window-controls {
  position: absolute;
  top: 0;
  right: 0;
  height: 40px;
  display: flex;
  align-items: stretch;
  -webkit-app-region: no-drag;
  app-region: no-drag;
  z-index: 20;
}
.app-titlebar {
  position: relative;
}
.window-ctrl {
  width: 46px;
  height: 40px;
  border: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  color: var(--text);
  font-size: 14px;
  line-height: 1;
  cursor: default;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.window-ctrl:hover {
  background: var(--tab-active, rgba(255, 255, 255, 0.08));
}
.window-ctrl-close:hover {
  background: #e81123;
  color: #fff;
}
body.platform-darwin .window-controls {
  /* macOS keeps native traffic lights when decorations/overlay used; hide custom */
  display: none;
}
"""
    # ensure .app-titlebar has position relative - may duplicate rule; ok
    cs = cs.replace(
        ".app-titlebar {\n  flex-shrink: 0;",
        ".app-titlebar {\n  position: relative;\n  flex-shrink: 0;",
        1,
    )
    cs += snippet
    css.write_text(cs, encoding="utf-8")
    print("styles.css window-controls added")
else:
    print("styles already has window-controls")
