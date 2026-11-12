from pathlib import Path
ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# Fix matrix error codes
m = ROOT / "scripts/ai-shot-matrix-r31.mjs"
t = m.read_text(encoding="utf-8")
t = t.replace("errorCode: 'http_401'", "errorCode: 'AI_HTTP_401'")
t = t.replace("errorCode: 'http_429'", "errorCode: 'AI_HTTP_429'")
m.write_text(t, encoding="utf-8")
print("matrix codes fixed")

# Fix AIPanel default aiError code to AI_HTTP_401 for consistency
p = ROOT / "src/renderer/src/components/AIPanel.tsx"
pt = p.read_text(encoding="utf-8")
old = ": 'http_401'"
# only in aiError handler context
idx = pt.find("if (detail?.op === 'aiError')")
chunk = pt[idx:idx+800]
if "http_401" in chunk:
    pt = pt[:idx] + chunk.replace(": 'http_401'", ": 'AI_HTTP_401'", 1) + pt[idx+800:]
    p.write_text(pt, encoding="utf-8")
    print("panel default code fixed")
else:
    print("panel default already or not found", "AI_HTTP_401" in chunk)

# Fix test assertions for error codes
test = ROOT / "scripts/test-r31-empty-error-shots.ts"
tt = test.read_text(encoding="utf-8")
tt = tt.replace("http_401", "AI_HTTP_401").replace("http_429", "AI_HTTP_429")
test.write_text(tt, encoding="utf-8")
print("test codes fixed")
