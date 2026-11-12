# -*- coding: utf-8 -*-
from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# AIPanel: import clearToasts if needed, call before showToast
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
p = panel_path.read_text(encoding="utf-8")
if "clearToasts" not in p.split("from '../lib/toast'")[0][-200:] and "clearToasts" not in p[:500]:
    # check import line
    pass
imp_old = "import { showToast } from '../lib/toast'"
imp_new = "import { clearToasts, showToast } from '../lib/toast'"
if "clearToasts" not in p:
    if imp_old not in p:
        # try double quotes / path variants
        import re
        m = re.search(r"import \{[^}]*showToast[^}]*\} from '[^']*toast'", p)
        print("import match", m.group() if m else None)
        if not m:
            raise SystemExit("showToast import not found")
        p = p.replace(m.group(), m.group().replace("showToast", "clearToasts, showToast"), 1)
    else:
        p = p.replace(imp_old, imp_new, 1)
    print("import updated")
else:
    print("clearToasts already mentioned", p.count("clearToasts"))

# In handler, clear before show
needle = """        const miss = buildAuditOpenAiMissToast()
        showToast(tg(miss.messageKey), {"""
repl = """        clearToasts()
        const miss = buildAuditOpenAiMissToast()
        showToast(tg(miss.messageKey), {"""
if "clearToasts()\n        const miss = buildAuditOpenAiMissToast()" not in p:
    if needle not in p:
        raise SystemExit("miss showToast block not found")
    p = p.replace(needle, repl, 1)
    print("clearToasts in handler")
else:
    print("handler clear already")

panel_path.write_text(p, encoding="utf-8", newline="\n")

# Fix matrix expect + remove diag eval
matrix = ROOT / "scripts/ai-shot-matrix-r33.mjs"
mt = matrix.read_text(encoding="utf-8")
old_expect = '''  const expectMiss =
    "!!(document.querySelector('[data-testid=toast]')&&document.querySelector('[data-testid=toast-action]')&&(document.querySelector('[data-testid=toast-action]').textContent||'').includes('新开对话')&&(document.querySelector('[data-testid=toast]').textContent||'').includes('新开对话'))"'''
new_expect = '''  const expectMiss =
    "!!([...document.querySelectorAll('[data-testid=toast]')].some((t)=>(t.textContent||'').includes('新开对话')&&!!t.querySelector('[data-testid=toast-action]')))"'''
if old_expect not in mt:
    # maybe already changed; rewrite function of expectMiss line
    import re
    mt2, n = re.subn(
        r"  const expectMiss =\n    \"[^\"]+\"",
        new_expect,
        mt,
        count=1,
    )
    if n != 1:
        raise SystemExit(f"expectMiss replace failed n={n}")
    mt = mt2
else:
    mt = mt.replace(old_expect, new_expect, 1)
print("expect updated")

# remove diag eval step
diag = """, { eval: \"JSON.stringify({cls:document.documentElement.className,toast:document.querySelector('[data-testid=toast]')?.textContent,action:document.querySelector('[data-testid=toast-action]')?.textContent,stackVis:getComputedStyle(document.querySelector('.toast-stack')||document.body).visibility,n:document.querySelectorAll('[data-testid=toast]').length})\" }"""
# written with different escaping in file
import re
mt2, n = re.subn(
    r", \{ eval: \"JSON\.stringify\(\{cls:document\.documentElement\.className,toast:document\.querySelector\('\[data-testid=toast\]'\)\?\.textContent,action:document\.querySelector\('\[data-testid=toast-action\]'\)\?\.textContent,stackVis:getComputedStyle\(document\.querySelector\('\.toast-stack'\)\|\|document\.body\)\.visibility,n:document\.querySelectorAll\('\[data-testid=toast\]'\)\.length\}\)\" \}",
    "",
    mt,
    count=1,
)
if n == 1:
    mt = mt2
    print("diag removed")
else:
    # simpler
    if "JSON.stringify({cls:" in mt:
        start = mt.find(", { eval: \"JSON.stringify({cls:")
        end = mt.find("})\" }", start) + len("})\" }")
        mt = mt[:start] + mt[end:]
        print("diag removed looser")
    else:
        print("no diag found")

matrix.write_text(mt, encoding="utf-8", newline="\n")

# Update test expect string check
test = ROOT / "scripts/test-r33-miss-en-chip-shots.ts"
tt = test.read_text(encoding="utf-8")
if "querySelectorAll('[data-testid=toast]')" not in tt and 'querySelectorAll("[data-testid=toast]")' not in tt:
    tt = tt.replace(
        "assert.ok(miss?.expect?.includes('toast-action'))\nassert.ok(miss?.expect?.includes('新开对话'))",
        "assert.ok(miss?.expect?.includes('querySelectorAll'))\nassert.ok(miss?.expect?.includes('toast-action'))\nassert.ok(miss?.expect?.includes('新开对话'))\nassert.ok(panel.includes('clearToasts'))",
    )
    # panel already read later - need to ensure clearToasts assert after panel const
    if "assert.ok(panel.includes('clearToasts'))" not in tt.split("const panel")[1][:800]:
        tt = tt.replace(
            "assert.ok(panel.includes('Round 33: calm miss toast'))",
            "assert.ok(panel.includes('Round 33: calm miss toast'))\nassert.ok(panel.includes('clearToasts'))",
        )
    # remove duplicate if any from earlier replace
    while tt.count("assert.ok(panel.includes('clearToasts'))") > 1:
        # keep one after Round 33
        first = tt.find("assert.ok(panel.includes('clearToasts'))")
        second = tt.find("assert.ok(panel.includes('clearToasts'))", first+1)
        if second < 0: break
        # remove the one near miss expect if present before panel
        if second < tt.find("const panel"):
            tt = tt[:first] + tt[first+len("assert.ok(panel.includes('clearToasts'))\n"):]
        else:
            tt = tt[:second] + tt[second+len("assert.ok(panel.includes('clearToasts'))\n"):]
    test.write_text(tt, encoding="utf-8", newline="\n")
    print("test updated")
else:
    print("test already")

print("fix done")
