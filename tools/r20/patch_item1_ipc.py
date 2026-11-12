# -*- coding: utf-8 -*-
from pathlib import Path
import re

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- index.ts ---
idx = ROOT / "src/main/index.ts"
t = idx.read_text(encoding="utf-8")
if "getWorkingMemorySnapshot" not in t:
    m = re.search(r"import \{([^}]+)\} from '\./core-a-memory'", t)
    if not m:
        raise SystemExit("import not found")
    names = m.group(1)
    if "getWorkingMemorySnapshot" not in names:
        new_imp = "import {" + names.rstrip() + ("" if names.rstrip().endswith(",") else ",") + " getWorkingMemorySnapshot } from './core-a-memory'"
        t = t.replace(m.group(0), new_imp)
    old = "ipcMain.handle('ai:workingMemory:get', (_e, key: string) => getWorkingMemoryGoal(String(key ?? '')))"
    new = old + "\n  ipcMain.handle('ai:workingMemory:snapshot', (_e, key: string) => getWorkingMemorySnapshot(String(key ?? '')))"
    if old not in t:
        raise SystemExit("ipc handle not found")
    t = t.replace(old, new, 1)
    idx.write_text(t, encoding="utf-8")
    print("index.ts patched")
else:
    print("index.ts already")

# --- preload ---
pre = ROOT / "src/preload/index.ts"
pt = pre.read_text(encoding="utf-8")
if "getMemorySnapshot" not in pt and "workingMemory:snapshot" not in pt:
    old = "getWorkingMemory: (key: string): Promise<string | null> => ipcRenderer.invoke('ai:workingMemory:get', key),"
    new = (
        "getWorkingMemory: (key: string): Promise<string | null> => ipcRenderer.invoke('ai:workingMemory:get', key),\n"
        "    getMemorySnapshot: (key: string): Promise<{\n"
        "      goal: string | null\n"
        "      hostFacts: string[]\n"
        "      observations: string[]\n"
        "      recentCommands: string[]\n"
        "    } | null> => ipcRenderer.invoke('ai:workingMemory:snapshot', key),"
    )
    if old not in pt:
        raise SystemExit("preload getWorkingMemory not found")
    pre.write_text(pt.replace(old, new, 1), encoding="utf-8")
    print("preload patched")
else:
    print("preload already")

# --- vite-env ---
ve = ROOT / "src/renderer/src/vite-env.d.ts"
vt = ve.read_text(encoding="utf-8")
if "getMemorySnapshot" not in vt:
    old = "    getWorkingMemory: (key: string) => Promise<string | null>"
    new = (
        "    getWorkingMemory: (key: string) => Promise<string | null>\n"
        "    getMemorySnapshot?: (key: string) => Promise<{\n"
        "      goal: string | null\n"
        "      hostFacts: string[]\n"
        "      observations: string[]\n"
        "      recentCommands: string[]\n"
        "    } | null>"
    )
    if old not in vt:
        raise SystemExit("vite-env getWorkingMemory not found")
    ve.write_text(vt.replace(old, new, 1), encoding="utf-8")
    print("vite-env patched")
else:
    print("vite-env already")

# --- tauri-bridge ---
tb = ROOT / "src/renderer/src/tauri-bridge.ts"
tt = tb.read_text(encoding="utf-8")
if "getMemorySnapshot" not in tt:
    old = """      getWorkingMemory: async (key: string) => {
        try {
          const row = await invoke<any>('core_memory_get', { sessionKey: key })
          const goal = row?.workingMemory?.goal
          return typeof goal === 'string' && goal.trim() ? goal : null
        } catch {
          return null
        }
      },"""
    new = old.replace(
        "      },",
        """      },
      getMemorySnapshot: async (key: string) => {
        try {
          const row = await invoke<any>('core_memory_get', { sessionKey: key })
          if (!row || typeof row !== 'object') return null
          const goalRaw = row?.workingMemory?.goal
          const goal = typeof goalRaw === 'string' && goalRaw.trim() ? goalRaw.trim() : null
          const hostFacts = Array.isArray(row?.workingMemory?.hostFacts)
            ? row.workingMemory.hostFacts.filter((x: unknown) => typeof x === 'string' && String(x).trim())
            : []
          const om = Array.isArray(row?.observationalMemory)
            ? row.observationalMemory
                .map((b: any) => (typeof b?.text === 'string' ? b.text.trim() : ''))
                .filter(Boolean)
            : []
          const scratch = Array.isArray(row?.observations)
            ? row.observations.filter((x: unknown) => typeof x === 'string' && String(x).trim())
            : []
          const observations = om.length > 0 ? om : scratch
          const recentCommands = Array.isArray(row?.recentCommands)
            ? row.recentCommands.filter((x: unknown) => typeof x === 'string' && String(x).trim())
            : []
          if (!goal && hostFacts.length === 0 && observations.length === 0 && recentCommands.length === 0) return null
          return { goal, hostFacts, observations, recentCommands }
        } catch {
          return null
        }
      },""",
        1,
    )
    if old not in tt:
        raise SystemExit("tauri-bridge getWorkingMemory block not found")
    tb.write_text(tt.replace(old, new, 1), encoding="utf-8")
    print("tauri-bridge patched")
else:
    print("tauri-bridge already")

# guard stubs
if "ai.getMemorySnapshot" not in tt and "getMemorySnapshot = async" not in tb.read_text(encoding="utf-8"):
    pass
tt2 = tb.read_text(encoding="utf-8")
if "ai.getMemorySnapshot" not in tt2:
    stub_old = """  if (typeof ai.getWorkingMemory !== 'function') {
    ai.getWorkingMemory = async () => null
  }"""
    stub_new = stub_old + """
  if (typeof ai.getMemorySnapshot !== 'function') {
    ai.getMemorySnapshot = async () => null
  }"""
    if stub_old in tt2:
        tb.write_text(tt2.replace(stub_old, stub_new, 1), encoding="utf-8")
        print("tauri-bridge stub added")
    else:
        print("WARN: stub site not found")
else:
    print("tauri-bridge stub ok")

print("item1 ipc layer done")
