from pathlib import Path
p = Path("src/renderer/src/components/AIPanel.tsx")
pt = p.read_text(encoding="utf-8")
# Only replace the default in aiError handler - unique context
old = """        const errorCode =
          typeof (detail as { errorCode?: string }).errorCode === 'string'
            ? (detail as { errorCode?: string }).errorCode
            : 'http_401'"""
new = old.replace("'http_401'", "'AI_HTTP_401'")
assert old in pt
p.write_text(pt.replace(old, new, 1), encoding="utf-8")
print("fixed default")
