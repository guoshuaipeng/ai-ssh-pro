import json, time
import websocket

ws_url = "ws://127.0.0.1:9223/devtools/page/371A718CC29049AD5BF272527AEBBE8E"
msgs = []
ws = websocket.create_connection(ws_url, timeout=10)
ws.settimeout(0.5)
idgen = 1

def send(method, params=None):
    global idgen
    mid = idgen; idgen += 1
    payload = {"id": mid, "method": method}
    if params is not None:
        payload["params"] = params
    ws.send(json.dumps(payload))
    return mid

send("Runtime.enable")
send("Console.enable")
send("Log.enable")
send("Page.enable")
# collect events briefly
deadline = time.time() + 2
while time.time() < deadline:
    try:
        raw = ws.recv()
        msgs.append(json.loads(raw))
    except Exception:
        pass

# eval DOM diagnostics
mid = send("Runtime.evaluate", {
    "expression": """(() => {
      const root = document.getElementById('root');
      const html = document.documentElement.outerHTML.slice(0, 2000);
      const bodyText = (document.body && document.body.innerText || '').slice(0, 1500);
      const cs = getComputedStyle(document.body);
      const layout = localStorage.getItem('aiss-layout-v1');
      let aiss = typeof window.aiss;
      let err = null;
      try { aiss = window.aiss ? Object.keys(window.aiss).slice(0,20) : 'missing'; } catch(e) { err=String(e) }
      return {
        title: document.title,
        rootHTML: root ? root.innerHTML.slice(0, 2000) : null,
        rootChildCount: root ? root.childElementCount : -1,
        bodyText,
        bg: cs.backgroundColor,
        color: cs.color,
        layout,
        aiss,
        err,
        href: location.href,
        scripts: [...document.scripts].map(s => s.src || 'inline').slice(0,20),
      };
    })()""",
    "returnByValue": True,
    "awaitPromise": False,
})
# wait for result
result = None
deadline = time.time() + 5
while time.time() < deadline:
    try:
        raw = ws.recv()
        o = json.loads(raw)
        msgs.append(o)
        if o.get("id") == mid:
            result = o
            break
    except Exception:
        pass

print("=== EVAL ===")
print(json.dumps(result, ensure_ascii=False, indent=2)[:8000])
print("=== CONSOLE/EXCEPTIONS ===")
for m in msgs:
    method = m.get("method","")
    if method in ("Runtime.consoleAPICalled", "Runtime.exceptionThrown", "Log.entryAdded", "Inspector.detached"):
        print(json.dumps(m, ensure_ascii=False)[:2000])
ws.close()
