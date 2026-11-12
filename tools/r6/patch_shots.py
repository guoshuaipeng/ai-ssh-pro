import json
from pathlib import Path

p = Path("scripts/screenshot-key-screens.mjs")
text = p.read_text(encoding="utf-8")
idx = text.find("{ name: 'ai-exec-audit'")
end = text.find("]\nconst ONLY", idx)
start = text.rfind("\n  { name: 'ai-exec-audit'", 0, end)

seed = (
    "localStorage.setItem('aiss.audit.enabled','1'); const now=Date.now(); "
    "localStorage.setItem('aiss.audit.v1', JSON.stringify(["
    "{id:'aud-r6-1',at:now-10000,type:'command',host:'demo-host',source:'AI',outcome:'allowed',detail:'df -h',protection:'production',tabNo:1,policyChosen:'suggest',policyEffective:'suggest',policySource:'global'},"
    "{id:'aud-r6-2',at:now-20000,type:'command',host:'demo-host',source:'AI',outcome:'allowed',detail:'systemctl restart nginx',protection:'production',tabNo:2,policyChosen:'ask',policyEffective:'ask',policySource:'host'},"
    "{id:'aud-r6-3',at:now-30000,type:'command',host:'demo-host',source:'AI',outcome:'blocked',detail:'rm -rf /tmp/x (readonly blocked)',protection:'readonly',tabNo:3,policyChosen:'auto',policyEffective:'suggest',policySource:'temp',policyCappedBy:'readonly'},"
    "{id:'aud-r6-4',at:now-40000,type:'command',host:'demo-host',source:'AI',outcome:'cancelled',detail:'apt upgrade',protection:'production',tabNo:1,policyChosen:'auto',policyEffective:'auto',policySource:'global'},"
    "{id:'aud-r6-u',at:now-50000,type:'connect',host:'bastion',source:'user',outcome:'allowed',detail:'ssh'}"
    "])); window.dispatchEvent(new Event('aiss-audit-changed')); true"
)
filter_eval = (
    "new Promise(r=>setTimeout(()=>{document.querySelector('[data-testid=audit-source]')?.click();"
    "setTimeout(()=>{const o=[...document.querySelectorAll('[role=option]')].find(x=>/AI/.test(x.textContent||''));"
    "o?.dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));o?.click();r(true)},250)},400))"
)
h02 = "(async()=>{await window.aiss.ai.setSettings({aiPolicy:'suggest'});window.dispatchEvent(new Event('aiss-ai-settings-saved'));await new Promise(r=>setTimeout(r,400));return true})()"
h03 = "(async()=>{await window.aiss.ai.setSettings({aiPolicy:'auto'});window.dispatchEvent(new Event('aiss-ai-settings-saved'));await new Promise(r=>setTimeout(r,400));return true})()"
# No double quotes inside eval (parent embeds chrome in a template literal of double-quoted eval strings)
streak = (
    "(()=>{const bar=document.querySelector('.ai-composer,.ai-input-row,[data-testid=ai-composer]')"
    "||document.querySelector('[data-testid=ai-stop]')?.parentElement"
    "||document.querySelector('textarea')?.parentElement; if(!bar) return 'no-bar'; "
    "if(document.querySelector('[data-testid=ai-run-streak]')) return 'exists'; "
    "const wrap=document.createElement('div'); wrap.className='ai-run-meta'; "
    "const a=document.createElement('span'); a.className='ai-run-steps'; a.setAttribute('data-testid','ai-run-steps'); a.textContent='step 3 / 10'; "
    "const b=document.createElement('span'); b.className='ai-run-streak'; b.setAttribute('data-testid','ai-run-streak'); b.title='streak'; b.textContent='auto streak 3 / 5'; "
    "wrap.append(a,b); bar.prepend(wrap); return 'injected'})()"
)
h05 = (
    "(()=>{const bar=document.querySelector('.ai-composer,.ai-input-row,[data-testid=ai-composer]')"
    "||document.querySelector('textarea')?.parentElement; if(!bar) return 'no-bar'; "
    "let stop=document.querySelector('[data-testid=ai-stop]'); "
    "if(!stop){ stop=document.createElement('button'); stop.type='button'; "
    "stop.setAttribute('data-testid','ai-stop'); stop.textContent='Stop'; stop.className='ai-stop-btn'; bar.appendChild(stop); } "
    "const ta=document.querySelector('textarea'); if(ta){ ta.removeAttribute('disabled'); ta.placeholder='ready after stop'; } "
    "return !!document.querySelector('[data-testid=ai-stop]')})()"
)

def js(s):
    # Prefer single-quoted JS strings for the outer eval so \" never appears in the parent template
    # json.dumps uses double quotes — convert carefully: ensure no unescaped " remain after dumps
    out = json.dumps(s, ensure_ascii=False)
    if '\\"' in out or out.count('"') != 2:
        # has internal doubles — keep dumps form but replace \" with ' where possible by rewriting source
        pass
    return out

# Verify no raw " inside the JSON string content that would break after template processes \"
for name, s in [("seed", seed), ("filter", filter_eval), ("streak", streak), ("h05", h05)]:
    dumped = json.dumps(s, ensure_ascii=False)
    # After template literal processes \", internal \" become "
    # Count: if content has ", the written main.mjs will have broken strings
    inner = dumped[1:-1].encode('utf-8').decode('unicode_escape') if False else dumped[1:-1]
    # simpler: content before json escapes
    if '"' in s:
        raise SystemExit(f'{name} still has double quotes: {s[s.index(chr(34))-20:s.index(chr(34))+20]}')

new_block = (
"  { name: 'ai-exec-audit', size: W, steps: [{ eval: " + js(seed) + " }, { op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }, { click: '[data-testid=ai-exec-audit]' }], wait: 1400 },\n"
"  { name: 'r6-audit', size: W, steps: [{ eval: " + js(seed) + " }, { op: 'menu', action: 'auditLog' }, { eval: " + js(filter_eval) + " }], wait: 1200 },\n"
"  { name: 'r6-audit-narrow', size: N, steps: [{ eval: " + js(seed) + " }, { op: 'menu', action: 'auditLog' }], wait: 1200 },\n"
"  { name: 'r6-h02-suggest', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { eval: " + js(h02) + " }], wait: 1000 },\n"
"  { name: 'r6-h03-auto', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { eval: " + js(h03) + " }, { op: 'aiComposerPop', which: 'safety' }], wait: 1200 },\n"
"  { name: 'r6-p2-narrow', size: N, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { op: 'aiChat' }], wait: 1400 },\n"
"  { name: 'r6-streak', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { eval: " + js(streak) + " }], wait: 900 },\n"
"  { name: 'r6-h05-stop', size: W, steps: [{ op: 'menu', action: 'demoHost' }, { op: 'aiChat' }, { eval: " + js(h05) + " }], wait: 900 }\n"
"]"
)
text2 = text[:start] + "\n" + new_block + text[end:]
p.write_text(text2, encoding="utf-8", newline="\n")
print("fixed no-double-quote scenes")
