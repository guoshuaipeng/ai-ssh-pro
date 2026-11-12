# -*- coding: utf-8 -*-
"""Round 19 item 2: confirm dock + plan progress narrow tighten."""
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
css_path = ROOT / "src/renderer/src/styles.css"
css = css_path.read_text(encoding="utf-8")

marker = "/* R19 Round19: confirm dock + plan progress narrow */"
block = """
/* R19 Round19: confirm dock + plan progress narrow */
.ai-pending-confirm {
  container-type: inline-size;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  border-top: 1px solid var(--color-border-default);
  background: var(--color-bg-elevated);
}
.ai-pending-confirm-main {
  flex: 1 1 140px;
  gap: var(--space-1);
}
.ai-pending-confirm-preview {
  font-size: var(--fs-xs);
  line-height: var(--lh-tight);
}
.ai-pending-confirm-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1);
  min-width: 0;
}
.ai-pending-confirm-actions .ai-fill-cmd-btn {
  min-height: 28px;
}
.ai-pending-need-hint {
  max-width: min(140px, 100%);
}
@container (max-width: 280px) {
  .ai-pending-confirm-main {
    flex: 1 1 100%;
  }
  .ai-pending-confirm-actions {
    flex: 1 1 100%;
    margin-left: 0;
    justify-content: flex-start;
  }
  .ai-pending-need-hint {
    flex: 1 1 100%;
    max-width: 100%;
  }
  .ai-pending-confirm-preview {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}
/* Plan progress: tighten badge + streak on narrow cards / composer */
.ai-panel .ai-active-plan-badge {
  margin: var(--space-1) var(--space-2) 0;
  max-width: calc(100% - var(--space-4));
  overflow: hidden;
  text-overflow: ellipsis;
}
@container (max-width: 230px) {
  .ai-panel .ai-active-plan-badge {
    margin-left: var(--space-2);
    margin-right: var(--space-2);
  }
  .ai-composer-bar .ai-run-steps {
    flex-wrap: wrap;
    row-gap: 0;
    white-space: normal;
  }
  .ai-composer-bar .ai-run-streak {
    flex: 1 1 100%;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

"""

if marker in css:
    print("css already has R19 confirm dock block")
else:
    # Place after existing sticky dock comment block — replace the old rules lightly by appending
    # after .ai-pending-need-hint block (before .ai-input-row)
    anchor = ".ai-pending-need-hint {\n  font-size: var(--fs-sm);\n  color: var(--color-text-muted);\n  max-width: 140px;\n  line-height: var(--lh-tight);\n}\n\n.ai-input-row {"
    if anchor not in css:
        # try CRLF
        anchor2 = anchor.replace("\n", "\r\n")
        if anchor2 in css:
            css = css.replace(anchor2, ".ai-pending-need-hint {\r\n  font-size: var(--fs-sm);\r\n  color: var(--color-text-muted);\r\n  max-width: 140px;\r\n  line-height: var(--lh-tight);\r\n}\r\n" + block.replace("\n", "\r\n") + "\r\n.ai-input-row {", 1)
        else:
            raise SystemExit("pending-need-hint anchor not found")
    else:
        css = css.replace(
            anchor,
            ".ai-pending-need-hint {\n  font-size: var(--fs-sm);\n  color: var(--color-text-muted);\n  max-width: 140px;\n  line-height: var(--lh-tight);\n}\n"
            + block
            + "\n.ai-input-row {",
            1,
        )
    css_path.write_text(css, encoding="utf-8")
    print("css: R19 confirm dock block inserted")

# Panel: add data attribute on pending dock for tests (optional polish)
panel_path = ROOT / "src/renderer/src/components/AIPanel.tsx"
panel = panel_path.read_text(encoding="utf-8")
old = """        <div
          className="ai-pending-confirm"
          role="region"
          tabIndex={-1}
          aria-label={tg('ux64.pendingTitle')}
          data-testid="ai-pending-confirm"
          data-action={pendingConfirm.action}
        >
"""
new = """        <div
          className="ai-pending-confirm"
          role="region"
          tabIndex={-1}
          aria-label={tg('ux64.pendingTitle')}
          data-testid="ai-pending-confirm"
          data-action={pendingConfirm.action}
          data-r19-narrow="1"
        >
"""
if 'data-r19-narrow="1"' not in panel:
    if old not in panel:
        raise SystemExit("pending confirm JSX not found")
    panel = panel.replace(old, new, 1)
    panel_path.write_text(panel, encoding="utf-8")
    print("panel: data-r19-narrow on dock")
else:
    print("panel: already marked")

print("item2 patch done")
