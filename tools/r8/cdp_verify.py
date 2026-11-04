import json, time, sys
import websocket
ws_url = sys.argv[1]
ws = websocket.create_connection(ws_url, timeout=10)
ws.settimeout(0.4)
idgen = 1
msgs=[]
def send(method, params=None):
    global idgen
    mid=idgen; idgen+=1
    o={"id":mid,"method":method}
    if params is not None: o["params"]=params
    ws.send(json.dumps(o)); return mid
send("Runtime.enable"); send("Console.enable"); send("Log.enable")
time.sleep(1.5)
deadline=time.time()+2
while time.time()<deadline:
    try: msgs.append(json.loads(ws.recv()))
    except Exception: pass
mid=send("Runtime.evaluate",{"expression":"""(() => {
  const root=document.getElementById('root');
  const layout=localStorage.getItem('aiss-layout-v1');
  const text=(document.body&&document.body.innerText||'').slice(0,500);
  const hasApp=!!(root && root.childElementCount>0);
  const aiPanel=!!document.querySelector('[data-testid=\"ai-panel\"], .ai-panel, aside.ai, [class*=\"ai-panel\"]');
  return {
    hasApp, childCount: root?root.childElementCount:-1,
    layout, textLen: text.length, textPreview: text.slice(0,200),
    getWorkingMemory: typeof window.aiss?.ai?.getWorkingMemory,
    confirmStep: typeof window.aiss?.ai?.confirmStep,
    title: document.title,
  };
})()""","returnByValue":True})
result=None
deadline=time.time()+5
while time.time()<deadline:
    try:
        o=json.loads(ws.recv()); msgs.append(o)
        if o.get('id')==mid: result=o; break
    except Exception: pass
print('EVAL', json.dumps(result, ensure_ascii=False)[:3000])
errs=[]
for m in msgs:
    if m.get('method') in ('Runtime.exceptionThrown','Runtime.consoleAPICalled'):
        if m.get('method')=='Runtime.exceptionThrown' or (m.get('params') or {}).get('type')=='error':
            errs.append(m)
print('ERR_COUNT', len(errs))
for e in errs[:5]:
    print(json.dumps(e, ensure_ascii=False)[:1500])
ws.close()
