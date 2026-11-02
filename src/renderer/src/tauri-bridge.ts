/**
 * Tauri bridge: exposes window.aiss with the same shape as Electron preload.
 * Real: SSH connect/write/resize/exec, sessions store, app helpers.
 * Stubs: SFTP/Docker/AI agent/forwards/etc. — return safe empty values.
 */
import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'
import { writeText, readText } from '@tauri-apps/plugin-clipboard-manager'
import { openUrl } from '@tauri-apps/plugin-opener'

type AnyFn = (...args: any[]) => any

function unsubListen(p: Promise<UnlistenFn>): () => void {
  let u: UnlistenFn | null = null
  void p.then((fn) => {
    u = fn
  })
  return () => {
    if (u) u()
  }
}

async function notImpl(name: string): Promise<never> {
  throw new Error(`${name} is not yet implemented in the Tauri build`)
}

function emptySessions() {
  return { folders: [], profiles: [] }
}

export async function installTauriBridge(): Promise<void> {
  const api: any = {
    clipboard: {
      writeText: (text: string) => {
        void writeText(String(text ?? ''))
      },
      readText: () => {
        // sync API in Electron; approximate with empty and async fill is hard — use sync cache
        return ''
      }
    },
    app: {
      onOpenDialog: (_cb: AnyFn) => () => {},
      getVersion: () => invoke<string>('app_get_version'),
      checkUpdate: () => invoke('app_check_update'),
      focus: () => invoke<boolean>('app_focus'),
      openExternal: async (url: string) => {
        await openUrl(url)
        return true
      },
      openGithub: () => invoke<boolean>('app_open_github'),
      getMcpGuideInfo: () => invoke('app_get_mcp_guide'),
      setUiChrome: (chrome: unknown) => invoke<boolean>('app_set_ui_chrome', { chrome })
    },
    ssh: {
      connect: (opts: unknown) => invoke('ssh_connect', { opts }),
      disconnect: (sessionId: string) => invoke('ssh_disconnect', { sessionId }),
      write: async (sessionId: string, data: string | Uint8Array | number[]) => {
        let s: string
        if (typeof data === 'string') s = data
        else if (data instanceof Uint8Array) s = new TextDecoder().decode(data)
        else s = new TextDecoder().decode(Uint8Array.from(data))
        return invoke<boolean>('ssh_write', { sessionId, data: s })
      },
      resize: (sessionId: string, cols: number, rows: number) =>
        invoke<boolean>('ssh_resize', { sessionId, cols, rows }),
      getSnapshot: (sessionId: string, options?: unknown) =>
        invoke<string | null>('ssh_get_snapshot', { sessionId, options: options ?? null }),
      respondHostKey: (payload: unknown) => invoke<boolean>('ssh_respond_host_key', { payload }),
      openLocalShell: (opts?: unknown) => invoke('ssh_open_local_shell', { opts: opts ?? null }),
      isLocalShellAvailable: () => invoke<boolean>('ssh_is_local_shell_available'),
      startRecording: async () => null,
      stopRecording: async () => false,
      setShellIntegration: async () => true,
      exec: (sessionId: string, command: string, timeoutMs?: number) =>
        invoke('ssh_exec', { sessionId, command, timeoutMs: timeoutMs ?? null }),
      onData: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:data', (e) => {
            cb(e.payload)
          })
        ),
      onStatus: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:status', (e) => {
            cb(e.payload)
          })
        ),
      onHostKeyPrompt: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:hostKeyPrompt', (e) => {
            cb(e.payload)
          })
        ),
      onPowerResume: (_cb: AnyFn) => () => {},
      onHostKeyExpired: (cb: AnyFn) =>
        unsubListen(
          listen('ssh:hostKeyExpired', (e) => {
            cb(e.payload)
          })
        ),
      probeJump: async () => [],
      onHop: (_cb: AnyFn) => () => {},
      onStage: (_cb: AnyFn) => () => {}
    },
    sftp: {
      list: (sessionId: string, remotePath: string) =>
        invoke('sftp_list', { sessionId, remotePath }),
      home: (sessionId: string) => invoke<string>('sftp_home', { sessionId }),
      download: (sessionId: string, remotePath: string, localPath: string) =>
        invoke('sftp_download', { sessionId, remotePath, localPath }),
      upload: (sessionId: string, localPath: string, remotePath: string) =>
        invoke('sftp_upload', { sessionId, localPath, remotePath }),
      mkdir: (sessionId: string, remotePath: string) =>
        invoke('sftp_mkdir', { sessionId, remotePath }),
      remove: (sessionId: string, remotePath: string) =>
        invoke('sftp_remove', { sessionId, remotePath }),
      rename: (sessionId: string, fromPath: string, toPath: string) =>
        invoke('sftp_rename', { sessionId, fromPath, toPath }),
      chmod: () => notImpl('sftp.chmod'),
      readText: (sessionId: string, remotePath: string, maxBytes?: number) =>
        invoke('sftp_read_text', { sessionId, remotePath, maxBytes: maxBytes ?? null }),
      writeText: (sessionId: string, remotePath: string, content: string) =>
        invoke('sftp_write_text', { sessionId, remotePath, content }),
      pickDownloadPath: async () => null,
      pickUploadFiles: async () => null,
      pickSavePaths: async () => null,
      onProgress: (_cb: AnyFn) => () => {},
      stat: (sessionId: string, remotePath: string) =>
        invoke('sftp_stat', { sessionId, remotePath }),
      hash: async () => '',
      cancel: async () => false,
      transfer: () => notImpl('sftp.transfer'),
      queueLoad: async () => [],
      queueSave: async (tasks: unknown) => tasks
    },
    localFs: {
      home: async () => '',
      drives: async () => ({ drives: [], cwd: '' }),
      list: async () => ({ path: '', entries: [] }),
      stat: async () => null,
      mkdir: async () => false,
      rename: async () => false,
      trash: async () => ({ token: '' }),
      restore: async () => false,
      reveal: async () => false,
      open: async () => '',
      hash: async () => '',
      readText: async () => ({ ok: false, content: '', truncated: false }),
      detectKeyKind: async () => 'unknown',
      pickPrivateKey: async () => null,
      pickCertificate: async () => null
    },
    knownHosts: {
      list: () => invoke('known_hosts_list'),
      remove: (hostPort: string) => invoke<boolean>('known_hosts_remove', { hostPort }),
      pickImport: async () => null,
      applyImport: (rows: unknown) => invoke('known_hosts_apply_import', { rows }),
      listLocalKeys: async () => ({ dir: '', keys: [] }),
      openSshDir: async () => false,
      lookupHost: async () => ({ ok: false, query: '', file: '', matches: [] })
    },
    docker: {
      listTree: async () => ({ containers: [], compose: [], swarm: [], error: 'not implemented' }),
      watchEvents: async () => false,
      unwatchEvents: async () => false,
      onChanged: (_cb: AnyFn) => () => {},
      containerAction: async () => false,
      inspect: () => notImpl('docker.inspect'),
      logs: async () => '',
      swarmInspect: () => notImpl('docker.swarmInspect'),
      swarmLogs: async () => '',
      swarmAction: async () => false,
      composePs: async () => ({ services: [], error: 'not implemented' }),
      composeAction: async () => false,
      openShell: () => notImpl('docker.openShell')
    },
    fs: {
      pathForFile: () => '',
      writeFile: async () => false
    },
    sessions: {
      list: async () => {
        const v = await invoke<any>('sessions_list')
        return v && typeof v === 'object' ? v : emptySessions()
      },
      save: (state: unknown) => invoke('sessions_save', { value: state }),
      importPick: async () => null,
      importSshConfig: async () => ({ items: [], warnings: [] }),
      export: () => notImpl('sessions.export'),
      discoverElectronStore: () => invoke('electron_store_discover'),
      importElectronStore: () => invoke('electron_store_import')
    },
    snippets: {
      list: async () => {
        const v = await invoke<any>('store_get', { path: ['snippets'] })
        return Array.isArray(v) ? v : []
      },
      save: (list: unknown) => invoke('store_set', { path: ['snippets'], value: list })
    },
    inventory: {
      list: async () => [],
      get: async () => null,
      search: async () => [],
      upsert: () => notImpl('inventory.upsert'),
      remove: async () => false,
      setServices: async () => null
    },
    terminal: {
      getPrefs: async () => {
        const v = await invoke<any>('store_get', { path: ['terminalPrefs'] })
        return (
          v || {
            fontSize: 14,
            fontFamily: 'Cascadia Mono, Consolas, monospace',
            cursorBlink: true,
            scrollback: 5000
          }
        )
      },
      setPrefs: (prefs: unknown) => invoke('store_set', { path: ['terminalPrefs'], value: prefs })
    },
    ai: {
      getSettings: async () => invoke('store_get', { path: ['ai'] }),
      setSettings: (s: unknown) => invoke('store_set', { path: ['ai'], value: s }),
      chat: () => notImpl('ai.chat'),
      abortChat: async () => {},
      parseSsh: () => notImpl('ai.parseSsh'),
      assist: () => notImpl('ai.assist'),
      abortAssist: async () => {},
      testProvider: () => notImpl('ai.testProvider'),
      resolveConfirm: async () => {},
      getChatHistory: async (key: string) => {
        const all = (await invoke<any>('store_get', { path: ['aiChatHistory'] })) || {}
        return Array.isArray(all[key]) ? all[key] : []
      },
      setChatHistory: async (key: string, msgs: unknown) => {
        const all = (await invoke<any>('store_get', { path: ['aiChatHistory'] })) || {}
        all[key] = msgs
        await invoke('store_set', { path: ['aiChatHistory'], value: all })
      },
      chatArchive: {
        list: async () => {
          const v = await invoke<any>('store_get', { path: ['aiChatArchive'] })
          return Array.isArray(v) ? v : []
        },
        add: async (row: unknown) => {
          const v = (await invoke<any>('store_get', { path: ['aiChatArchive'] })) || []
          const next = Array.isArray(v) ? [...v, row] : [row]
          await invoke('store_set', { path: ['aiChatArchive'], value: next })
        },
        take: async (id: string) => {
          const v = (await invoke<any>('store_get', { path: ['aiChatArchive'] })) || []
          const list = Array.isArray(v) ? v : []
          const hit = list.find((e: any) => e?.id === id) || null
          const next = list.filter((e: any) => e?.id !== id)
          await invoke('store_set', { path: ['aiChatArchive'], value: next })
          return hit
        },
        getChatHistory: async (key: string) => {
          const all = (await invoke<any>('store_get', { path: ['aiChatHistory'] })) || {}
          return Array.isArray(all[key]) ? all[key] : []
        }
      },
      onStream: (_cb: AnyFn) => () => {}
    },
    debug: {
      openWindow: async () => {},
      onPush: (_cb: AnyFn) => () => {}
    },
    tools: {
      processes: async () => [],
      kill: () => notImpl('tools.kill'),
      services: async () => [],
      service: () => notImpl('tools.service'),
      ports: async () => [],
      df: async () => [],
      logs: async () => ({ text: '', code: null, at: Date.now() })
    },
    backup: {
      export: () => notImpl('backup.export'),
      import: () => notImpl('backup.import')
    },
    workspace: {
      ping: async () => null,
      probeHosts: async () => [],
      batchExec: () => notImpl('workspace.batchExec'),
      resources: async () => ({ at: Date.now() }),
      healthProbe: () => notImpl('workspace.healthProbe'),
      healthProbeSweep: async () => ({ ok: true }),
      healthProbeRelease: async () => ({ ok: true }),
      forwards: {
        list: (sessionId?: string) =>
          invoke('forwards_list', { sessionId: sessionId ?? null }),
        add: (req: unknown) => invoke('forwards_add', { req }),
        restore: async () => ({ ok: false, restored: [], skipped: [] }),
        remove: (id: string) => invoke<boolean>('forwards_remove', { id })
      },
      commandHistory: {
        list: async () => {
          const v = await invoke<any>('store_get', { path: ['commandHistory'] })
          return Array.isArray(v) ? v : []
        },
        push: async (command: string) => {
          const v = (await invoke<any>('store_get', { path: ['commandHistory'] })) || []
          const next = [command, ...(Array.isArray(v) ? v : [])].slice(0, 200)
          await invoke('store_set', { path: ['commandHistory'], value: next })
          return next
        },
        clear: async () => {
          await invoke('store_set', { path: ['commandHistory'], value: [] })
          return []
        }
      },
      recent: {
        list: async () => {
          const v = await invoke<any>('store_get', { path: ['recentConnections'] })
          return Array.isArray(v) ? v : []
        },
        remove: async (id: string) => {
          const v = (await invoke<any>('store_get', { path: ['recentConnections'] })) || []
          const next = (Array.isArray(v) ? v : []).filter((e: any) => e?.id !== id)
          await invoke('store_set', { path: ['recentConnections'], value: next })
          return next
        },
        pin: async (id: string, pinned: boolean) => {
          const v = (await invoke<any>('store_get', { path: ['recentConnections'] })) || []
          const next = (Array.isArray(v) ? v : []).map((e: any) =>
            e?.id === id ? { ...e, pinned } : e
          )
          await invoke('store_set', { path: ['recentConnections'], value: next })
          return next
        }
      },
      locale: {
        get: async () => {
          const v = await invoke<any>('store_get', { path: ['locale'] })
          return v === 'en-US' ? 'en-US' : 'zh-CN'
        },
        set: async (locale: string) => {
          await invoke('store_set', { path: ['locale'], value: locale })
          return locale
        }
      }
    },
    recordings: {
      list: async () => [],
      read: async () => '',
      delete: async () => false
    },
    sync: {
      getConfig: async () => null,
      setConfig: async (patch: unknown) => patch,
      test: async () => ({ ok: false, message: 'not implemented' }),
      push: async () => ({ ok: false, message: 'not implemented' }),
      pull: async () => ({ ok: false, message: 'not implemented' }),
      backupLocal: async () => ({ ok: false })
    },
    files: {
      saveText: async () => null,
      saveBytes: async () => null,
      reveal: async () => false
    },
    snapshots: {
      list: async () => [],
      stats: async () => ({ files: 0, bytes: 0, count: 0 }),
      put: async () => ({ added: false, skipped: 'not implemented', count: 0 }),
      setPrefs: async (prefs: any) => ({ auto: !!prefs?.auto, keep: prefs?.keep ?? 10 }),
      read: async () => ({ ok: false, reason: 'not implemented' }),
      pin: async () => null,
      delete: async () => ({ ok: false }),
      clear: async () => ({ ok: true, n: 0 }),
      openDir: async () => ({ ok: false })
    }
  }

  // Warm clipboard read into a tiny sync cache for paste UX later
  try {
    const t = await readText()
    api.clipboard.readText = () => t || ''
  } catch {
    /* ignore */
  }

  ;(window as any).aiss = api
  console.warn('[tauri-bridge] window.aiss installed')
}
