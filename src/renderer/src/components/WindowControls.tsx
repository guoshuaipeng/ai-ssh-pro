import { useCallback, useEffect, useState } from 'react'
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
        <span aria-hidden className={maximized ? "window-ctrl-icon window-ctrl-icon-restore" : "window-ctrl-icon window-ctrl-icon-max"} />
      </button>
      <button type="button" className="window-ctrl window-ctrl-close" title="Close" aria-label="Close" onClick={close}>
        <span aria-hidden>×</span>
      </button>
    </div>
  )
}
