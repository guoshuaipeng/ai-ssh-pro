const fs = require('fs');

const readme = `# Round 14 screenshots — AI state matrix

Standardized Electron harness for recurring AI-dialog visual QA.

## Matrix (dark + light)

| File | State | Notes |
|------|-------|-------|
| \`*-r14-cancel-retry.png\` | H05 cancel + Retry | \`data-card=cancelled\` + \`ai-cancelled-retry\` |
| \`*-r14-d29-resume.png\` | D29 troubleshoot chip | \`ai-resume-last\` \`data-resume-kind=troubleshoot\` |
| \`*-r14-busy.png\` | Busy + streaming | header \`ai-busy-chip\` + in-card Stop |
| \`*-r14-prod-banner.png\` | H01 / 2.4 prod banner | \`ai-prod-auto-banner\` (screenshot protection override) |
| \`*-r14-suggest-narrow.png\` | H02 suggest @ 960×760 | \`safety-suggest\` + Copy primary |
| \`*-r14-accent-stack.png\` | Accent hierarchy | streaming / cancelled / error left bars together |

## Harness (reproducible)

Declarative scenarios live in \`scripts/ai-shot-matrix-r14.mjs\` and are JSON-injected into the chrome set (no nested eval quotes).

\`\`\`
node scripts/screenshot-key-screens.mjs docs/screenshots/r14 --set chrome --only r14-cancel-retry,r14-d29-resume,r14-busy,r14-prod-banner,r14-suggest-narrow,r14-accent-stack --themes dark,light
\`\`\`

Reuse prior build:

\`\`\`
node scripts/screenshot-key-screens.mjs docs/screenshots/r14 --no-build --set chrome --only r14-cancel-retry,r14-d29-resume,r14-busy,r14-prod-banner,r14-suggest-narrow,r14-accent-stack --themes dark,light
\`\`\`

### Gap fixes this round
1. Specialized AI ops must open the panel first (\`aiChat empty\`) or stash on \`window.__aissShotAiOp\` (App) for mount replay.
2. \`reset\` clears pending shot ops so scenarios do not leak.
3. Prod banner uses screenshot-only \`protectionForUi\` override (does not mutate host profile).

### Expect hooks
Each scenario carries a DOM \`expect\` checked by the harness (exit ≠ 0 on failure).
`;
fs.writeFileSync('docs/screenshots/r14/README.md', readme.replace(/\n/g, '\r\n'), 'utf8');

// Append retro
const retroPath = 'docs/retro.md';
let retro = fs.readFileSync(retroPath, 'utf8');
const retroAdd = `
## 2026-11-05 第 78 轮（Round 14）AI 对话 — 截图 harness 标准化 + 卡片左边条
- 计划：约 30 分钟；1 高频标准化 Electron AI 态截图矩阵（cancel-retry / D29 / busy / prod banner / suggest narrow）→ \`docs/screenshots/r14/\`；1 小打磨 streaming/cancelled/error 左边条层级。
- 实际：约 55 分钟。矩阵 12/12 expect 绿；Core-A 34/34；held-out H01–H08 绿（H01 wiring 随 \`protectionForUi\` 更新）。
- 卡在哪：① 首跑 expect 全红——\`reset\` 关 AI 面板后直接发 \`aiCancelled\` 等，AIPanel 未挂载丢事件；② 仅面板内 stash 不够，必须 App 侧 \`__aissShotAiOp\` + 挂载回放；③ H01 夹具写死 \`protection === 'production'\`，被 R14 override 改写打断。
- 根因：截图 op 假定面板已挂载；双监听（App 开面板 / Panel 填态）无 pending 契约；held-out wiring 绑死旧标识符。
- 以后怎么避免：AI 态截图一律 \`demoHost → aiChat(empty) → stateOp\` 或 App stash+replay；新 screenshot op 同步改 App 开面板列表；改 panel 保护字段时同步 held-out wiring 字符串；矩阵场景放 \`ai-shot-matrix-r14.mjs\` JSON 注入，禁止在 chrome 模板里手写嵌套 eval。
- 验收：\`test-r14-ai-shot-harness\` / \`test-r14-card-accents\` + Core-A 34/34 + held-out 全绿；\`docs/screenshots/r14/\` dark/light × 6 态。
`;
if (!retro.includes('Round 14）AI 对话')) {
  fs.writeFileSync(retroPath, retro.replace(/\s*$/, '') + retroAdd.replace(/\n/g, '\r\n'), 'utf8');
  console.log('retro appended');
}

// Prepend backlog
const backlogPath = 'docs/backlog.md';
let backlog = fs.readFileSync(backlogPath, 'utf8');
const blAdd = `## 2026-11-05 Round 14 追加
- 已完成：Electron AI 态截图 harness 标准化（\`scripts/ai-shot-matrix-r14.mjs\` + hooks \`aiCancelled\`/\`aiEmptyResume\`/\`aiProdBanner\`/\`aiSuggestCard\`/\`aiAccentStack\` + App stash/replay）；\`docs/screenshots/r14/\` 宽窄×深浅矩阵；streaming/cancelled/error 左边条层级（accent / muted / danger）。
- P2：composer 策略菜单窄栏折行（Roadmap 视觉债）；真机 Tauri 与 Electron harness 对照抽检（可选）。
- P1 候选 Round 15：保持 AI 对话——composer 策略菜单窄栏 / 或 Roadmap 迭代 3 前再扫 AI 对话缺口（多轮进度可见性、建议卡批量复制）；默认不接端口转发除非用户改优先级。
- 未做：Core-A 仍不接 production safetyContext（策略题继续 held-out JSON）。

### Round 14 UX 验收（编码后）
- 主 CTA：取消「重试」、仅建议「复制」、D29 整芯片、生产横幅可点开策略——截图 expect 覆盖。
- 层级：流式=accent 左边条（进行中）、取消=muted、错误=danger；三色不同时齐飞背景。
- 绑定：prod banner 仅 screenshot override，不改主机档案。
- 矩阵：\`docs/screenshots/r14/README.md\`。

`;
if (!backlog.includes('Round 14 追加')) {
  // insert after first heading block - prepend near top after title
  const marker = '# Backlog';
  const idx = backlog.indexOf(marker);
  if (idx >= 0) {
    const endFirstPara = backlog.indexOf('\n## ', idx);
    const at = endFirstPara >= 0 ? endFirstPara + 1 : backlog.length;
    backlog = backlog.slice(0, at) + blAdd.replace(/\n/g, '\r\n') + backlog.slice(at);
  } else {
    backlog = blAdd.replace(/\n/g, '\r\n') + backlog;
  }
  fs.writeFileSync(backlogPath, backlog, 'utf8');
  console.log('backlog prepended');
}
console.log('docs done');
