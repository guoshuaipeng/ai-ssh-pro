import json
from pathlib import Path

p = Path("tests/fixtures/core-a/core-a-s12-high-risk-confirm.json")
data = json.loads(p.read_text(encoding="utf-8"))
# Round 28: host is already named prod-web-01; attach real production protection.
data["safetyContext"] = {
    "protection": "production",
    "production": True,
    "hostId": "host-prod-web-01",
    "hostName": "prod-web-01.internal",
}
# Keep ask/confirm behavior; do not fold held-out auto-policy cases into Core-A.
note = data.get("passCriteriaSummary") or []
if "Round 28: safetyContext.protection=production forwarded to chat payload" not in note:
    note.append("Round 28: safetyContext.protection=production forwarded to chat payload")
data["passCriteriaSummary"] = note
p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print("S12 safetyContext ok")
