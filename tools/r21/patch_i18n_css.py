# -*- coding: utf-8 -*-
from pathlib import Path

ROOT = Path(r"E:\pythonProjects\ai-ssh-pro")
i18n = ROOT / "src/renderer/src/lib/i18n.tsx"
t = i18n.read_text(encoding="utf-8")

zh = """  'exec.openHostAudit': '本机审计',
"""
zh_new = """  'exec.openHostAudit': '本机审计',
  'fail.title': '命令失败',
  'fail.kind.nonzero': '非零退出',
  'fail.kind.stderr': '标准错误',
  'fail.kind.timeout': '超时',
  'fail.kind.write': '写入失败',
  'fail.noAutoRetry': '不会自动重跑 · 重试须新的确认',
  'fail.noRetryBudget': '重试预算已用尽 · 不会自动重跑，请换个问法',
  'fail.retry': '带证据重试',
  'fail.askDifferent': '换个问法',
  'fail.retryTip': '发起新提问并附带失败证据；不会静默重跑，执行前仍需确认',
  'fail.retryExhaustedTip': '预算已用尽：把证据填入输入框，请换命令或说明后再发',
  'fail.budget': '连续失败 {n}/{cap}',
  'fail.budgetExhausted': '重试预算已用尽',
  'fail.showOutput': '查看输出',
  'fail.hideOutput': '收起输出',
  'fail.noEvidence': '没有可引用的失败证据',
  'fail.retryAsk': '上一条已确认命令失败。请根据证据继续处理，禁止自动重跑；若需再执行须新的确认。\\n命令：{command}\\n证据：\\n{evidence}',
  'fail.exhaustedAsk': '同一命令重试预算已用尽。请换个问法或换命令（禁止自动重跑）：\\n{evidence}',
"""

en = """  'exec.openHostAudit': 'Host audit',
"""
en_new = """  'exec.openHostAudit': 'Host audit',
  'fail.title': 'Command failed',
  'fail.kind.nonzero': 'Non-zero exit',
  'fail.kind.stderr': 'Stderr',
  'fail.kind.timeout': 'Timed out',
  'fail.kind.write': 'Write failed',
  'fail.noAutoRetry': 'Will not re-run on its own · a retry needs a new confirmation',
  'fail.noRetryBudget': 'Retry budget exhausted · will not re-run; ask a different way',
  'fail.retry': 'Retry with evidence',
  'fail.askDifferent': 'Ask differently',
  'fail.retryTip': 'Starts a new ask with the failure evidence; never silent re-run — confirm before write',
  'fail.retryExhaustedTip': 'Budget exhausted: paste evidence into the composer and change the command or ask',
  'fail.budget': 'Failures {n}/{cap}',
  'fail.budgetExhausted': 'Retry budget exhausted',
  'fail.showOutput': 'Show output',
  'fail.hideOutput': 'Hide output',
  'fail.noEvidence': 'No failure evidence to cite',
  'fail.retryAsk': 'The last confirmed command failed. Continue from the evidence; do not re-run on your own — a new confirmation is required to write again.\\nCommand: {command}\\nEvidence:\\n{evidence}',
  'fail.exhaustedAsk': 'Retry budget for the same command is exhausted. Ask a different way or change the command (no automatic re-run):\\n{evidence}',
"""

if "'fail.title'" not in t:
    if zh not in t or en not in t:
        raise SystemExit('i18n anchors missing')
    t = t.replace(zh, zh_new, 1).replace(en, en_new, 1)
    # fix double-escaped newlines in template values to single \n for i18n strings
    t = t.replace("禁止自动重跑；若需再执行须新的确认。\\\\n命令：{command}\\\\n证据：\\\\n{evidence}", "禁止自动重跑；若需再执行须新的确认。\\n命令：{command}\\n证据：\\n{evidence}")
    t = t.replace("请换个问法或换命令（禁止自动重跑）：\\\\n{evidence}", "请换个问法或换命令（禁止自动重跑）：\\n{evidence}")
    t = t.replace("a new confirmation is required to write again.\\\\nCommand: {command}\\\\nEvidence:\\\\n{evidence}", "a new confirmation is required to write again.\\nCommand: {command}\\nEvidence:\\n{evidence}")
    t = t.replace("change the command (no automatic re-run):\\\\n{evidence}", "change the command (no automatic re-run):\\n{evidence}")
    i18n.write_text(t, encoding="utf-8")
    print("i18n ok")
else:
    print("i18n already")

# CSS
css = ROOT / "src/renderer/src/styles.css"
ct = css.read_text(encoding="utf-8")

fail_css = """
/* R21 Round21: pinned failure evidence on reply card (S27) */
.ai-panel .ai-failure-evidence {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin: 0 0 var(--space-2);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-danger-border, var(--color-border-default));
  border-left: 3px solid var(--color-danger);
  border-radius: var(--radius-md);
  background: var(--color-danger-soft, var(--color-fill-muted));
}
.ai-panel .ai-failure-evidence.is-exhausted {
  border-left-color: var(--color-warn);
}
.ai-panel .ai-failure-evidence-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--space-2);
  min-width: 0;
}
.ai-panel .ai-failure-evidence-title {
  font-weight: 600;
  color: var(--color-danger);
  font-size: var(--fs-sm);
}
.ai-panel .ai-failure-evidence-kind,
.ai-panel .ai-failure-evidence-budget {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
  white-space: nowrap;
}
.ai-panel .ai-failure-evidence-body {
  margin: 0;
  max-height: 9.5em;
  overflow: auto;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-surface-raised, var(--color-bg));
  color: var(--color-text);
  font-size: var(--fs-xs);
  line-height: 1.4;
  white-space: pre-wrap;
  word-break: break-word;
}
.ai-panel .ai-failure-evidence-note {
  font-size: var(--fs-xs);
  color: var(--color-text-muted);
}
.ai-panel .ai-failure-evidence-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}
.ai-panel .ai-failure-evidence-actions .ai-fill-cmd-btn.is-muted {
  opacity: 0.55;
}
@container (max-width: 230px) {
  .ai-panel .ai-failure-evidence {
    padding: var(--space-2);
  }
  .ai-panel .ai-failure-evidence-actions {
    width: 100%;
  }
  .ai-panel .ai-failure-evidence-actions .ai-fill-cmd-btn {
    flex: 1 1 auto;
  }
}

/* R21: memory chip ultra-narrow — count only, label in title/aria */
@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 4.5rem;
    flex: 0 0 auto;
    flex-basis: auto;
  }
  .ai-panel .ai-memory-chip-label {
    display: none;
  }
  .ai-panel .ai-memory-chip-count {
    flex: 0 0 auto;
  }
  .ai-panel .ai-memory-chip-count::before {
    content: none;
  }
}

"""

# Avoid token fallbacks per project rules - check-token-fallbacks
# Use only known tokens without fallbacks
fail_css = fail_css.replace("var(--color-danger-border, var(--color-border-default))", "var(--color-border-default)")
fail_css = fail_css.replace("var(--color-danger-soft, var(--color-fill-muted))", "var(--color-fill-muted)")
fail_css = fail_css.replace("var(--color-surface-raised, var(--color-bg))", "var(--color-bg)")

if "R21 Round21: pinned failure evidence" not in ct:
    marker = "/* R20 Round20: working-memory / observational evidence (honest, not a dump) */"
    if marker not in ct:
        # append before ai-exec-replay
        marker2 = ".ai-exec-replay {"
        if marker2 not in ct:
            raise SystemExit('css markers missing')
        ct = ct.replace(marker2, fail_css + marker2, 1)
    else:
        ct = ct.replace(marker, fail_css + marker, 1)
    # Also tighten existing R20 @container memory wrap if conflicting
    old_mem = """@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 100%;
    flex-basis: 100%;
  }
}"""
    new_mem = """@container (max-width: 230px) {
  .ai-panel .ai-memory-wrap {
    max-width: 4.5rem;
    flex: 0 0 auto;
    flex-basis: auto;
  }
  .ai-panel .ai-memory-chip-label {
    display: none;
  }
}"""
    if old_mem in ct:
        ct = ct.replace(old_mem, new_mem, 1)
    css.write_text(ct, encoding="utf-8")
    print("css ok")
else:
    print("css already")
