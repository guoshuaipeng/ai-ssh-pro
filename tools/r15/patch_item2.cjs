const fs = require('fs')

// --- AIPanel ---
const panelPath = 'src/renderer/src/components/AIPanel.tsx'
let panel = fs.readFileSync(panelPath, 'utf8')
if (panel.includes('collectSuggestionCommands')) {
  console.log('panel already has batch copy')
} else {
  const importNeedle = "import { AI_POLICIES, isAiPolicy, policyTier, resolveAiPolicy, type AiPolicy } from '@shared/ai-policy'"
  const importAdd = importNeedle + "\nimport { collectSuggestionCommands, formatSuggestionCommandsForCopy } from '@shared/ai-suggestion-steps'"
  if (!panel.includes(importNeedle)) { console.error('import needle missing'); process.exit(1) }
  panel = panel.replace(importNeedle, importAdd)

  const stepMemo = `  // H07: number consecutive command/tool suggestion cards so steps stay readable.
  const suggestionStepNo = useMemo(() => {`
  const stepExtra = `  // R15: multi-step plan — batch-copy all shell commands when 2+.
  const suggestionCommands = useMemo(() => collectSuggestionCommands(lines), [lines])
  const batchCopyText = useMemo(() => formatSuggestionCommandsForCopy(suggestionCommands), [suggestionCommands])

` + stepMemo
  if (!panel.includes(stepMemo)) { console.error('suggestionStepNo memo missing'); process.exit(1) }
  panel = panel.replace(stepMemo, stepExtra)

  const tail = '        <div ref={tailRef} />'
  const bar = `        {batchCopyText ? (
          <div className="ai-batch-copy-bar" data-testid="ai-batch-copy-bar" role="region" aria-label={tg('ai.copyAllSteps')}>
            <span className="ai-batch-copy-count" data-testid="ai-batch-copy-count">
              {tg('ai.stepsCount', { n: suggestionCommands.length })}
            </span>
            <button
              type="button"
              className="ai-fill-cmd-btn ai-btn-batch-copy"
              data-testid="ai-batch-copy"
              title={tg('ai.copyAllStepsTip')}
              aria-label={tg('ai.copyAllSteps')}
              onClick={() => copyText(batchCopyText)}
            >
              {tg('ai.copyAllSteps')}
            </button>
          </div>
        ) : null}
` + tail
  if (!panel.includes(tail)) { console.error('tailRef missing'); process.exit(1) }
  if ((panel.match(/<div ref=\{tailRef\} \/>/g) || []).length !== 1) {
    console.error('unexpected tailRef count')
    process.exit(1)
  }
  panel = panel.replace(tail, bar)
  fs.writeFileSync(panelPath, panel)
  console.log('AIPanel batch copy wired')
}

// --- i18n ---
const i18nPath = 'src/renderer/src/lib/i18n.tsx'
let i18n = fs.readFileSync(i18nPath, 'utf8')
if (i18n.includes("'ai.copyAllSteps'")) {
  console.log('i18n already has copyAllSteps')
} else {
  const zhNeedle = "  'ai.stepIndex': '步骤 {n}',"
  const zhAdd = `  'ai.stepIndex': '步骤 {n}',
  'ai.stepsCount': '共 {n} 步命令',
  'ai.copyAllSteps': '复制全部步骤',
  'ai.copyAllStepsTip': '按顺序复制本对话中的全部建议命令（换行分隔）',`
  if (!i18n.includes(zhNeedle)) { console.error('zh stepIndex missing'); process.exit(1) }
  i18n = i18n.replace(zhNeedle, zhAdd)

  const enNeedle = "  'ai.stepIndex': 'Step {n}',"
  const enAdd = `  'ai.stepIndex': 'Step {n}',
  'ai.stepsCount': '{n} command steps',
  'ai.copyAllSteps': 'Copy all steps',
  'ai.copyAllStepsTip': 'Copy every suggested command in this chat, in order (one per line)',`
  if (!i18n.includes(enNeedle)) { console.error('en stepIndex missing'); process.exit(1) }
  i18n = i18n.replace(enNeedle, enAdd)
  fs.writeFileSync(i18nPath, i18n)
  console.log('i18n keys added')
}

// --- CSS ---
const cssPath = 'src/renderer/src/styles.css'
let css = fs.readFileSync(cssPath, 'utf8')
if (css.includes('R15 Round15: multi-step batch copy')) {
  console.log('CSS batch already')
} else {
  const marker = '/* R15 Round15: composer policy menu narrow'
  const at = css.indexOf(marker)
  if (at < 0) { console.error('R15 composer marker missing'); process.exit(1) }
  const block = `/* R15 Round15: multi-step batch copy bar */
.ai-panel .ai-batch-copy-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-1) var(--space-2);
  margin: var(--space-2) 0 0;
  padding: var(--space-1) var(--space-2);
  border: 1px solid var(--color-border-muted);
  border-radius: var(--radius-md);
  background: var(--color-bg-elevated);
  min-width: 0;
}
.ai-panel .ai-batch-copy-count {
  flex: 1 1 auto;
  min-width: 0;
  font-size: var(--fs-xs);
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ai-panel .ai-btn-batch-copy {
  flex: 0 0 auto;
  white-space: nowrap;
  font-weight: var(--fw-semibold);
}
@container (max-width: 230px) {
  .ai-panel .ai-batch-copy-bar {
    align-items: stretch;
  }
  .ai-panel .ai-batch-copy-count {
    flex: 1 1 100%;
  }
}

`
  css = css.slice(0, at) + block + css.slice(at)
  fs.writeFileSync(cssPath, css)
  console.log('CSS batch bar added')
}
