const fs = require('fs')

const retroPath = 'docs/retro.md'
let retro = fs.readFileSync(retroPath, 'utf8')
if (retro.includes('第 79 轮（Round 15）')) {
  console.log('retro already has R15')
} else {
  const entry = `
## 2026-11-05 第 79 轮（Round 15）AI 对话 — composer 策略菜单窄栏 + 多步批量复制
- 计划：约 30 分钟；1 高频 composer 策略菜单窄栏折行 + 1 小打磨多步建议「复制全部步骤」。
- 实际：约 40 分钟。两项交付；Core-A 34/34；held-out H01–H08 绿；真机矩阵仍欠（沿用 R6–R14 债，R14 harness 可补拍）。
- 卡在哪：① PowerShell 内联 \`node -e\` 模板字符串被转义炸；② 测 i18n 须 \`--tsconfig tsconfig.web.json\` 才能解析 \`@shared/*\`。
- 根因：窄栏 composer 只给了 console chip 的 300px 规则，策略/模型芯片与 safety pop 未按 wrap+ellipsis 收口；多步建议只有单卡 Copy。
- 以后怎么避免：composer chrome 新增芯片一律挂 \`@container (max-width: 230px)\` wrap/ellipsis；多步计划类能力先抽 shared 纯函数再接线 UI；本机补丁优先 \`.cjs\` 文件。
- 验收：\`test-r15-composer-policy-narrow\` / \`test-r15-batch-copy-steps\` + Core-A 34/34 + held-out 全绿；宽窄×深浅真机截图仍待 harness/rebuild。
`
  fs.writeFileSync(retroPath, retro.trimEnd() + '\n' + entry)
  console.log('retro appended')
}

const backlogPath = 'docs/backlog.md'
let backlog = fs.readFileSync(backlogPath, 'utf8')
if (backlog.includes('## 2026-11-05 Round 15 追加')) {
  console.log('backlog already has R15')
} else {
  const entry = `## 2026-11-05 Round 15 追加
- 已完成：composer 策略菜单窄栏（chips wrap + 标签 ellipsis + safety pop 全宽可读，\`test-r15-composer-policy-narrow\`）；多步建议 **复制全部步骤**（\`ai-suggestion-steps\` + \`ai-batch-copy\`，≥2 命令才出现）。
- P2：真机/ Electron harness 补拍策略菜单窄栏开合 + 批量复制条（可扩 r14 matrix）；Tauri rebuild 对照抽检（可选）。
- P1 候选 Round 16：保持 AI 对话——多轮计划进度条（与 \`ai-run-steps\`/streak 对齐可见性）/ 或批量「填入下一条」；或 Roadmap 迭代 3 前再扫对话缺口。默认不接端口转发。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out）。

### Round 15 轻量视觉审查（逢 3 轮）→ backlog
- P2 窄栏 composer：策略芯片「执行前确认」ellipsis 后依赖 title 读全文——核对 tooltip 在触控/无悬停场景是否够用；必要时图标-only + aria-label。
- P2 批量复制条：出现在消息尾、靠近 composer；多轮很长时可能需滚到底才看见——候选「贴顶 sticky」或紧挨第一张建议卡。
- P3 策略 pop 标题「AI 执行策略（此标签页）」窄栏折两行可接受；若仍挤，可短标题 + tip。
- P3 真机宽/窄×深/浅矩阵仍欠（R6–R14 遗留）：优先拍 safety pop 开合、batch-copy 条、R14 六态对照。

### Round 15 UX 验收（编码后）
- 主 CTA：策略选项仍是菜单主操作；批量复制为次要（单卡 Copy 保留）。
- 窄栏：chips wrap；menu label 可换行；\`@container 230px\` 收紧 model/chip，隐藏 spacer，run-steps 整行。
- 绑定：batch copy 只读当前对话 lines，不跨主机。
- 空态：<2 命令不显示条。
- 待真机：rebuild / Electron harness 矩阵。

`
  // prepend after title-ish area: insert at start of file content after first heading block if possible
  const anchor = '# Backlog'
  const ai = backlog.indexOf(anchor)
  if (ai >= 0) {
    const nl = backlog.indexOf('\n', ai)
    backlog = backlog.slice(0, nl + 1) + '\n' + entry + backlog.slice(nl + 1)
  } else {
    backlog = entry + backlog
  }
  fs.writeFileSync(backlogPath, backlog)
  console.log('backlog prepended')
}
