import json, time, sys
import websocket
ws = websocket.create_connection(sys.argv[1], timeout=10)
ws.settimeout(0.5)
idgen=1
def send(method, params=None):
    global idgen
    mid=idgen; idgen+=1
    o={"id":mid,"method":method}
    if params is not None: o["params"]=params
    ws.send(json.dumps(o)); return mid
send("Runtime.enable")
mid=send("Runtime.evaluate",{"expression":"""(async () => {
  const { getCurrentWindow } = await import('http://tauri.localhost/assets/index.tauri-' + (document.scripts[0]?.src||'').split('index.tauri-').pop()?.replace('.js','') + '.js').catch(()=>({}));
  let decorated = null, maximized = null;
  try {
    // use invoke via aiss if exposed
  } catch {}
  try {
    const w = window.__TAURI_INTERNALS__;
  } catch {}
  const ctrl = document.querySelector('[data-testid=window-controls]');
  const titlebar = document.querySelector('.app-titlebar');
  const drag = titlebar?.hasAttribute('data-tauri-drag-region');
  let isDecorated = null;
  try {
    const { getCurrentWindow } = await import('/@tauri-apps/api/window');
  } catch(e) {}
  // call through dynamic from global
  try {
    const mod = await import('https://invalid');
  } catch {}
  return {
    hasControls: !!ctrl,
    ctrlButtons: ctrl ? ctrl.querySelectorAll('button').length : 0,
    drag,
    hasApp: (document.getElementById('root')?.childElementCount||0) > 0,
    titlebarBg: titlebar ? getComputedStyle(titlebar).backgroundColor : null,
    bodyChild: document.body.className,
    getWorkingMemory: typeof window.aiss?.ai?.getWorkingMemory,
  };
})()""","returnByValue":True,"awaitPromise":True})
deadline=time.time()+8
result=None
while time.time()<deadline:
    try:
        o=json.loads(ws.recv())
        if o.get('id')==mid: result=o; break
    except Exception: pass
print(json.dumps(result, ensure_ascii=False)[:4000])
# also isDecorated via evaluate using __TAURI__
mid2=send("Runtime.evaluate",{"expression":"""(async()=>{
  try {
    const { getCurrentWindow } = window.__TAURI__?.window ? window.__TAURI__.window : await (async()=>{
      // bundled app may not expose namespace; use IPC
      return null;
    })();
  } catch(e) { return {err:String(e)} }
  // invoke core plugin
  try {
    const invoke = window.__TAURI_INTERNALS__?.invoke;
    if (!invoke) return { noInvoke: true, controls: !!document.querySelector('[data-testid=window-controls]') };
    const decorated = await invoke('plugin:window|is_decorated');
    return { decorated, controls: !!document.querySelector('[data-testid=window-controls]'), btns: document.querySelectorAll('[data-testid=window-controls] button').length };
  } catch(e) {
    return { err: String(e), controls: !!document.querySelector('[data-testid=window-controls]') };
  }
})()""","returnByValue":True,"awaitPromise":True})
deadline=time.time()+8
while time.time()<deadline:
    try:
        o=json.loads(ws.recv())
        if o.get('id')==mid2:
            print('DEC', json.dumps(o, ensure_ascii=False)[:2000]); break
    except Exception: pass
ws.close()
