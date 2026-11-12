# -*- coding: utf-8 -*-
"""R24 item2: shorten failure→next step suffix + test."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

# i18n: add fail.nextConfirmStep after each fail.nextConfirmTip
i18n = ROOT / "src/renderer/src/lib/i18n.tsx"
t = i18n.read_text(encoding="utf-8")
if "fail.nextConfirmStep" not in t:
    t = t.replace(
        "'fail.nextConfirmTip': '滚动到确认坞；主操作仍是同意执行，不会静默写入',",
        "'fail.nextConfirmTip': '滚动到确认坞；主操作仍是同意执行，不会静默写入',\n  'fail.nextConfirmStep': '下一步 · {n}',",
    )
    t = t.replace(
        "'fail.nextConfirmTip': 'Scroll to the confirm dock; Agree stays primary — never silent write',",
        "'fail.nextConfirmTip': 'Scroll to the confirm dock; Agree stays primary — never silent write',\n  'fail.nextConfirmStep': 'Next · {n}',",
    )
    i18n.write_text(t, encoding="utf-8")
    print("i18n: nextConfirmStep added", t.count("fail.nextConfirmStep"))
else:
    print("i18n: already")

# panel: use short step on the link; keep tip with full context
panel = ROOT / "src/renderer/src/components/AIPanel.tsx"
p = panel.read_text(encoding="utf-8")
old = """                        {tg('fail.nextConfirm')}
                        {alignedPlan.step ? ` · ${tg('ai.activePlanStep', { n: alignedPlan.step, max: planStepDisplayMax(alignedPlan) })}` : ''}"""
new = """                        {alignedPlan.step
                          ? tg('fail.nextConfirmStep', { n: alignedPlan.step })
                          : tg('fail.nextConfirm')}"""
if old not in p:
    raise SystemExit("next-confirm render not found")
p = p.replace(old, new, 1)
# also stamp data-aligned-step on the link for harness/tests
old_btn = """                        className="link-btn ai-failure-next-confirm"
                        data-testid="ai-failure-next-confirm"
                        title={tg('fail.nextConfirmTip')}
                        onClick={() => focusAiPendingAfterFailure(pendingConfirm?.requestId)}
                      >"""
new_btn = """                        className="link-btn ai-failure-next-confirm"
                        data-testid="ai-failure-next-confirm"
                        data-aligned-step={alignedPlan.step || undefined}
                        data-aligned-max={alignedPlan.step ? planStepDisplayMax(alignedPlan) : undefined}
                        title={tg('fail.nextConfirmTip')}
                        onClick={() => focusAiPendingAfterFailure(pendingConfirm?.requestId)}
                      >"""
if old_btn not in p:
    raise SystemExit("next-confirm btn attrs not found")
p = p.replace(old_btn, new_btn, 1)
panel.write_text(p, encoding="utf-8")
print("panel: short nextConfirmStep")

# CSS: ensure link doesn't wrap harshly on narrow
css = ROOT / "src/renderer/src/styles.css"
c = css.read_text(encoding="utf-8")
marker = "/* R22 Round22: failure→next-confirm"
if "R24 Round24 polish: short failure→next step" not in c:
    block = """/* R24 Round24 polish: short failure→next step label on narrow */
.ai-panel .ai-failure-next-confirm {
  white-space: nowrap;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

"""
    if marker not in c:
        raise SystemExit("r22 css marker missing")
    c = c.replace(marker, block + marker, 1)
    css.write_text(c, encoding="utf-8")
    print("css: short next")
else:
    print("css: already")

print("item2 patch done")
