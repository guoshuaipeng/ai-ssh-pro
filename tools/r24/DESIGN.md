# Round 24 design (AI chat only) — UX review before code
# Product bar: calm hierarchy; one primary CTA (Agree); Chinese precise; host/session bound.

## Item 1 — High-freq: post-retry confirm ↔ plan-step chip never desync
Problem: after 「带证据重试」, R23 scrolls to the confirm dock, but:
- Dock title has no plan step → user cannot match dock to chip/badge.
- Active-plan badge uses `suggestionStepNo.get(i) ?? alignedPlan.step` while chip uses `alignedPlan` — should be identical when confirmable.
- Chip only paints when `busy && runProgress`; if busy clears while pending briefly, chip vanishes and dock/card disagree.

Design:
- Single source: `alignPlanStepDisplay` → `alignedPlan` for chip, confirmable badge, dock step, and failure→next link.
- Pending dock shows calm step annotation (`ai-pending-plan-step`, data-aligned-step/max/source) — not a second CTA.
- Composer `ai-run-steps` also shows when `pendingConfirm` (even without busy), so post-retry path always has chip ↔ dock ↔ badge same n/max.
- Confirmable badge forces `alignedPlan.step/max` (no divergent map lookup).
Must-verify: failed history + new confirm → suggestion source; rapid retry while busy toasts; no silent write; wide+narrow.

## Item 2 — Polish: every-3 full-page light visual audit → backlog + one quick fix
Audit surfaces (code + R14–R22 harness ops): empty/busy/cancel/error/suggest/prod/policy/pending/failure/plan-align/memory.
Quick fix candidate from audit: shorten failure→next link step suffix (R22 P3) to 「下一步 · {n}」 so narrow failure+dock stays calm; OR dock step from item 1 closes the loudest gap.
File remaining findings as P1–P3; include R19–R24 process retro (every-6).
