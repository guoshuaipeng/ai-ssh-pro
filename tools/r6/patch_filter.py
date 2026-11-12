from pathlib import Path
p = Path("src/shared/audit-log.ts")
raw = p.read_bytes()
print("crlf", b"\r\n" in raw, "lf", b"\n" in raw)
text = raw.decode("utf-8")
# normalize for search
norm = text.replace("\r\n", "\n")
needle = "q: { host?: string; type?: AuditType | ''; text?: string; since?: number; until?: number }"
if needle not in norm:
    raise SystemExit("needle missing")
norm2 = norm.replace(
    needle,
    "q: { host?: string; type?: AuditType | ''; text?: string; since?: number; until?: number; source?: AuditSource | '' }",
    1,
)
insert = "    if (q.type && e.type !== q.type) return false\n"
extra = "    if (q.type && e.type !== q.type) return false\n    if (q.source && (e.source ?? '') !== q.source) return false\n"
if extra.strip() in norm2:
    raise SystemExit("already patched")
if insert not in norm2:
    raise SystemExit("insert anchor missing")
norm2 = norm2.replace(insert, extra, 1)
# write back with original newline style
out = norm2.replace("\n", "\r\n") if b"\r\n" in raw else norm2
p.write_bytes(out.encode("utf-8"))
print("patched filterAudit")
