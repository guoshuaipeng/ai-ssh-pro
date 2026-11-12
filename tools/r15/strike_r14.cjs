const fs = require('fs')
const p = 'docs/backlog.md'
let s = fs.readFileSync(p, 'utf8')
const old = '- P2：composer 策略菜单窄栏折行（Roadmap 视觉债）；真机 Tauri 与 Electron harness 对照抽检（可选）。'
const neu = '- ~~P2：composer 策略菜单窄栏折行~~ → Round 15 已做；真机 Tauri 与 Electron harness 对照抽检（可选）仍欠。'
if (s.includes(neu)) console.log('already struck')
else if (s.includes(old)) {
  s = s.replace(old, neu)
  fs.writeFileSync(p, s)
  console.log('struck R14 P2')
} else console.log('R14 P2 line not found as expected')
