# -*- coding: utf-8 -*-
"""R32 item1: audit→AI miss toast action = New chat (not Back to top)."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

def norm_write(path: Path, text: str):
    path.write_text(text.replace("\r\n", "\n"), encoding="utf-8", newline="\n")

# --- shared helper: document new semantics ---
miss = ROOT / "src/shared/ai-audit-miss.ts"
m = miss.read_text(encoding="utf-8")
old_doc = "/** Round 22: audit → AI jump miss — calm info toast (not error). */"
new_doc = "/** Round 22/32: audit → AI jump miss — calm info toast; action starts a new chat (no fabricated history). */"
if old_doc not in m:
    raise SystemExit("ai-audit-miss doc marker missing")
m = m.replace(old_doc, new_doc, 1)
norm_write(miss, m)
print("patched ai-audit-miss.ts")

# --- i18n ---
i18n = ROOT / "src/renderer/src/lib/i18n.tsx"
t = i18n.read_text(encoding="utf-8")
repls = [
    ("'au2.openAiMiss': '当前对话里没有这条步骤（可能已新开对话或不在本会话）',",
     "'au2.openAiMiss': '当前对话里没有这条步骤。可在本主机新开对话继续，不会编造历史。',"),
    ("'au2.openAiMissAction': '回到顶部',",
     "'au2.openAiMissAction': '新开对话',"),
    ("'au2.openAiMiss': 'That step is not in the current chat (new chat or different session)',",
     "'au2.openAiMiss': 'That step is not in this chat. Start a new chat on this host — history is not invented.',"),
    ("'au2.openAiMissAction': 'Back to top',",
     "'au2.openAiMissAction': 'New chat',"),
]
for a, b in repls:
    if a not in t:
        raise SystemExit(f"i18n missing: {a[:60]}")
    t = t.replace(a, b, 1)
norm_write(i18n, t)
print("patched i18n")

# --- AIPanel: ref + miss action ---
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
p = panel.read_text(encoding="utf-8")

# Add ref near other refs after scrollConfirmAfterEvidenceRetryRef
anchor = "  const scrollConfirmAfterEvidenceRetryRef = useRef(false)\n"
insert = anchor + "  /** R32: miss toast → startNewChat (effect is declared above the callback). */\n  const startNewChatRef = useRef<(() => void) | null>(null)\n"
if "startNewChatRef" not in p:
    if anchor not in p:
        raise SystemExit("ref anchor missing")
    p = p.replace(anchor, insert, 1)
    print("added startNewChatRef")
else:
    print("startNewChatRef already present")

old_miss = """    if (!el) {
      // Round 22: calm info toast + scroll-to-top action (R17 weak-toast debt).
      const miss = buildAuditOpenAiMissToast()
      showToast(tg(miss.messageKey), {
        kind: miss.kind,
        theme: miss.theme,
        ms: miss.ms,
        action: {
          label: tg(miss.actionKey),
          run: () => {
            const list = document.querySelector<HTMLElement>('.ai-panel .ai-messages, .ai-panel [data-testid=\"ai-messages\"]')
            if (list) list.scrollTo({ top: 0, behavior: 'smooth' })
            else {
              const root = document.querySelector('.ai-panel') as HTMLElement | null
              root?.scrollTo?.({ top: 0, behavior: 'smooth' })
            }
          }
        }
      })
      return
    }"""

new_miss = """    if (!el) {
      // Round 32: calm info toast + New chat on this host (R17/R22 debt; no fabricated history).
      const miss = buildAuditOpenAiMissToast()
      showToast(tg(miss.messageKey), {
        kind: miss.kind,
        theme: miss.theme,
        ms: miss.ms,
        action: {
          label: tg(miss.actionKey),
          run: () => {
            startNewChatRef.current?.()
          }
        }
      })
      return
    }"""

if old_miss not in p:
    raise SystemExit("miss toast block not found exact")
p = p.replace(old_miss, new_miss, 1)

# Wire ref after startNewChat useCallback
marker = "  const startNewChat = useCallback(() => {\n"
# Find end of startNewChat callback: `}, [archiveCurrent, busy, persistKey, refreshWorkingGoal])`
end_marker = "  }, [archiveCurrent, busy, persistKey, refreshWorkingGoal])\n"
idx = p.find(marker)
if idx < 0:
    raise SystemExit("startNewChat missing")
end = p.find(end_marker, idx)
if end < 0:
    raise SystemExit("startNewChat end missing")
end_line = end + len(end_marker)
wire = "  startNewChatRef.current = startNewChat\n"
if "startNewChatRef.current = startNewChat" not in p:
    p = p[:end_line] + wire + p[end_line:]
    print("wired startNewChatRef")
else:
    print("startNewChatRef wire already present")

norm_write(panel, p)
print("patched AIPanel")
print("item1 ok")
