from pathlib import Path
br = Path("src/renderer/src/tauri-bridge.ts")
t = br.read_text(encoding="utf-8")
if "ensureAiBridgeSafety" not in t:
    # after install, before assigning window.aiss
    # find `(window as any).aiss = api` or similar
    marker = None
    for cand in [";(window as any).aiss = api", "window.aiss = api", "(window as unknown as { aiss: typeof api }).aiss = api"]:
        if cand in t:
            marker = cand
            break
    # search
    import re
    m = re.search(r"\(window as any\)\.aiss\s*=\s*api|window\.aiss\s*=\s*api", t)
    print("assign", m.group(0) if m else None, "at", m.start() if m else None)
    if m:
        guard = '''
  // Round-10: never leave AI panel mount paths as undefined (black-screen class of bugs)
  const ai = api.ai || (api.ai = {})
  if (typeof ai.getWorkingMemory !== 'function') {
    ai.getWorkingMemory = async () => null
  }
  if (typeof ai.confirmStep !== 'function' && typeof ai.resolveConfirm === 'function') {
    ai.confirmStep = ai.resolveConfirm.bind(ai)
  }
  if (typeof ai.confirmStep !== 'function') {
    ai.confirmStep = async () => false
  }
  if (typeof ai.setSessionProtection !== 'function') {
    ai.setSessionProtection = () => {}
  }
  if (typeof ai.parseSshForm !== 'function') {
    ai.parseSshForm = (raw: string) =>
      typeof ai.parseSsh === 'function' ? ai.parseSsh(raw) : Promise.resolve({ ok: false })
  }
'''
        t = t[: m.start()] + guard + "\n  " + t[m.start() :]
        br.write_text(t, encoding="utf-8")
        print("bridge safety guard inserted")
    else:
        # show end of installTauriBridge
        i = t.rfind("installTauriBridge")
        print(t[-800:])
else:
    print("guard exists")
