# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- i18n ---
i18n_path = ROOT / "src/renderer/src/lib/i18n.tsx"
i18n = i18n_path.read_text(encoding="utf-8")
zh = (
    "  'wm.goal': \"当前目标\",\n"
    "  'wm.memory': \"记忆\",\n"
    "  'wm.memoryTitle': \"本会话记得\",\n"
    "  'wm.hostFact': \"主机线索\",\n"
    "  'wm.observation': \"观测\",\n"
    "  'wm.recentCommand': \"近令\",\n"
    "  'wm.emptyEvidence': \"暂无观测证据\",\n"
)
en = (
    "  'wm.goal': \"Current goal\",\n"
    "  'wm.memory': \"Memory\",\n"
    "  'wm.memoryTitle': \"This chat remembers\",\n"
    "  'wm.hostFact': \"Host fact\",\n"
    "  'wm.observation': \"Observation\",\n"
    "  'wm.recentCommand': \"Recent cmd\",\n"
    "  'wm.emptyEvidence': \"No observational evidence yet\",\n"
)
if "'wm.memory'" not in i18n:
    i18n = i18n.replace(
        "  'wm.goal': \"当前目标\",\n  'wm.clearTitle':",
        zh + "  'wm.clearTitle':",
        1,
    )
    i18n = i18n.replace(
        "  'wm.goal': \"Current goal\",\n  'wm.clearTitle':",
        en + "  'wm.clearTitle':",
        1,
    )
    i18n_path.write_text(i18n, encoding="utf-8")
    print("i18n: memory keys added")
else:
    print("i18n: already")

print("i18n done")
