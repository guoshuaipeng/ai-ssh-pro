from pathlib import Path
Path("src/renderer/src/components/WindowControls.tsx").write_text('''import { useCallback, useEffect, useState } from 'react'

type TauriWindow = {
  isMaximized: () => Promise<boolean>
  onResized: (cb: () => void) => Promise<() => void>
  minimize: () => Promise<void>
  toggleMaximize: () => Promise<void>
  close: () => Promise<void>
}

function hasTauri(): boolean {
  try {
    return Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__)
  } catch {
    return false
  }
}

/**
 * Custom min / max / close for undecorated Tauri windows (Windows/Linux).
 * No-ops in Electron / screenshot harness where Tauri internals are absent.
 */
export default function WindowControls() {
  const [maximized, setMaximized] = useState(false)
  const [win, setWin] = useState<TauriWindow | null>(null)

  useEffect(() => {
    if (!hasTauri()) return
    let cancelled = false
    void import('@tauri-apps/api/window')
      .then((mod) => {
        if (cancelled) return
        setWin(mod.getCurrentWindow() as unknown as TauriWindow)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = useCallback(async () => {
    if (!win) return
    try {
      setMaximized(await win.isMaximized())
    } catch {
      /* ignore */
    }
  }, [win])

  useEffect(() => {
    if (!win) return
    void refresh()
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
  }, [win, refresh])

  if (!win) return null

  const minimize = () => {
    void win.minimize().catch(() => {})
  }
  const toggleMax = () => {
    void win
      .toggleMaximize()
      .then(() => refresh())
      .catch(() => {})
  }
  const close = () => {
    void win.close().catch(() => {})
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
        <span aria-hidden className={maximized ? "window-ctrl-icon window-ctrl-icon-restore" : "window-ctrl-icon window-ctrl-icon-max"} />
      </button>
      <button type="button" className="window-ctrl window-ctrl-close" title="Close" aria-label="Close" onClick={close}>
        <span aria-hidden>×</span>
      </button>
    </div>
  )
}
''', encoding='utf-8', newline='\n')
print('WindowControls guarded')
