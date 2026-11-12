# -*- coding: utf-8 -*-
"""Round 19 item 1: policy menu touch / no-hover readability."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")

# --- i18n ---
i18n = (ROOT / "src/renderer/src/lib/i18n.tsx").read_text(encoding="utf-8")
zh_ins = (
    "  'policy.chip.suggest': '仅建议',\n"
    "  'policy.chip.ask': '需确认',\n"
    "  'policy.chip.auto': '自动',\n"
)
en_ins = (
    "  'policy.chip.suggest': 'Suggest',\n"
    "  'policy.chip.ask': 'Confirm',\n"
    "  'policy.chip.auto': 'Auto',\n"
)
if "'policy.chip.ask'" not in i18n:
    i18n = i18n.replace(
        "  'policy.ask': '执行前确认',\n  'policy.auto': '自动执行',\n",
        "  'policy.ask': '执行前确认',\n  'policy.auto': '自动执行',\n" + zh_ins,
        1,
    )
    i18n = i18n.replace(
        "  'policy.ask': 'Confirm before run',\n  'policy.auto': 'Auto run',\n",
        "  'policy.ask': 'Confirm before run',\n  'policy.auto': 'Auto run',\n" + en_ins,
        1,
    )
    (ROOT / "src/renderer/src/lib/i18n.tsx").write_text(i18n, encoding="utf-8")
    print("i18n: chip keys added")
else:
    print("i18n: already has chip keys")

# --- AIPanel ---
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
panel = panel_path.read_text(encoding="utf-8")

# Extend safetyOpen effect to focus current option
old_eff = """  useEffect(() => {
    if (!safetyOpen) return
    const close = (e: MouseEvent) => {
      if (safetyRef.current?.contains(e.target as Node)) return
      setSafetyOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSafetyOpen(false)
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', esc, true)
    }
  }, [safetyOpen])
"""

new_eff = """  useEffect(() => {
    if (!safetyOpen) return
    const close = (e: MouseEvent) => {
      if (safetyRef.current?.contains(e.target as Node)) return
      setSafetyOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSafetyOpen(false)
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('keydown', esc, true)
    // R19: keyboard/touch — focus current policy option (no hover required to know where you are).
    const t = window.setTimeout(() => {
      const root = safetyRef.current
      if (!root) return
      const current =
        root.querySelector<HTMLElement>('[data-testid="ai-safety-option"].is-current') ||
        root.querySelector<HTMLElement>('[data-testid="ai-safety-option"]:not(.is-disabled)')
      current?.focus()
    }, 0)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('keydown', esc, true)
      window.clearTimeout(t)
    }
  }, [safetyOpen])
"""

if "R19: keyboard/touch" not in panel:
    if old_eff not in panel:
        raise SystemExit("safetyOpen effect block not found")
    panel = panel.replace(old_eff, new_eff, 1)
    print("panel: focus-on-open")
else:
    print("panel: focus-on-open already")

# Chip: is-open class + short label
old_chip = """              <button
                type="button"
                className={`ai-chip ai-safety-chip safety-band-${safetyBandTone(ladderBand)}${aiPolicy.source === 'temp' ? ' is-temp' : ''}`}
                data-testid="ai-safety-chip"
                data-band={ladderBand}
                data-policy={aiPolicy.effective}
                data-source={aiPolicy.source}
                data-capped={aiPolicy.cappedBy ?? ''}
                aria-haspopup="menu"
                aria-expanded={safetyOpen}
                aria-label={`${tg('ai.safetyChipTip')}: ${policyChipTitle}`}
                title={policyChipTitle}
                onClick={() => setSafetyOpen((v) => !v)}
              >
                <Icon name="shield" size={12} />
                <span className="ai-safety-chip-label">{tg(`policy.${aiPolicy.effective}` as 'policy.ask')}</span>
                {aiPolicy.cappedBy ? <span className="ai-chip-cap" data-testid="ai-safety-cap" aria-hidden="true">·</span> : null}
                <Icon name="chevron-down" size={12} />
              </button>
"""

new_chip = """              <button
                type="button"
                className={`ai-chip ai-safety-chip safety-band-${safetyBandTone(ladderBand)}${aiPolicy.source === 'temp' ? ' is-temp' : ''}${safetyOpen ? ' is-open' : ''}`}
                data-testid="ai-safety-chip"
                data-band={ladderBand}
                data-policy={aiPolicy.effective}
                data-source={aiPolicy.source}
                data-capped={aiPolicy.cappedBy ?? ''}
                data-chip-short={tg(`policy.chip.${aiPolicy.effective}` as 'policy.chip.ask')}
                aria-haspopup="menu"
                aria-expanded={safetyOpen}
                aria-label={`${tg('ai.safetyChipTip')}: ${policyChipTitle}`}
                title={policyChipTitle}
                onClick={() => setSafetyOpen((v) => !v)}
              >
                <Icon name="shield" size={12} />
                <span className="ai-safety-chip-label" data-testid="ai-safety-chip-label">
                  {tg(`policy.chip.${aiPolicy.effective}` as 'policy.chip.ask')}
                </span>
                {aiPolicy.cappedBy ? <span className="ai-chip-cap" data-testid="ai-safety-cap" aria-hidden="true">·</span> : null}
                <Icon name="chevron-down" size={12} />
              </button>
"""

if 'data-testid="ai-safety-chip-label"' not in panel:
    if old_chip not in panel:
        raise SystemExit("chip button block not found")
    panel = panel.replace(old_chip, new_chip, 1)
    print("panel: short chip label + is-open")
else:
    print("panel: chip already patched")

# Options: ensure they are focusable (tabIndex=0) for keyboard — buttons already are.
# Add data-touch="1" marker for tests on options class already has ai-safety-option.

panel_path.write_text(panel, encoding="utf-8")

# --- CSS ---
css_path = ROOT / "src/renderer/src/styles.css"
css = css_path.read_text(encoding="utf-8")
marker = "/* R19 Round19: policy menu touch / no-hover */"
block = """
/* R19 Round19: policy menu touch / no-hover */
.ai-composer-bar .ai-safety-chip.is-open {
  background: color-mix(in srgb, var(--color-text-primary) 14%, transparent);
  color: var(--color-text-primary);
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
}
.ai-composer-bar .ai-safety-chip .ai-safety-chip-label {
  max-width: 4.5em;
}
.ai-composer-bar .ai-safety-pop .ai-safety-option,
.ai-composer-bar .ai-safety-pop .ai-chip-menu-item.ai-safety-option {
  min-height: 40px;
  padding: var(--space-2);
  align-items: flex-start;
}
.ai-composer-bar .ai-safety-pop .ai-chip-menu-item.ai-safety-option:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: -2px;
  background: var(--color-row-hover-bg);
}
.ai-composer-bar .ai-safety-pop .ai-safety-link {
  min-height: 32px;
  padding: var(--space-1) var(--space-2);
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-md);
}
.ai-composer-bar .ai-safety-pop .ai-safety-link:focus-visible {
  outline: 2px solid var(--color-focus-ring);
  outline-offset: 1px;
  text-decoration: none;
  background: var(--color-row-hover-bg);
}
@container (max-width: 230px) {
  .ai-composer-bar .ai-safety-chip .ai-safety-chip-label {
    max-width: 3.5em;
  }
  .ai-composer-bar .ai-safety-chip {
    min-height: 32px;
    height: auto;
    padding-top: var(--space-1);
    padding-bottom: var(--space-1);
  }
}

"""

if marker not in css:
    # Insert after R15 composer policy block ends (before H02 suggest-only)
    anchor = "/* H02: suggest-only decision row — copy is the primary action, never Agree. */"
    if anchor not in css:
        raise SystemExit("H02 anchor missing")
    css = css.replace(anchor, block + anchor, 1)
    css_path.write_text(css, encoding="utf-8")
    print("css: R19 policy touch block")
else:
    print("css: already present")

print("item1 patch done")
