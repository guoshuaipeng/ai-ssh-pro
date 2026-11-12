const fs = require('fs')
const path = 'src/renderer/src/styles.css'
let css = fs.readFileSync(path, 'utf8')
const a = '.ai-composer-bar .ai-safety-chip > span:not(.ai-chip-cap),'
const b = '.ai-composer-bar .ai-safety-chip .ai-safety-chip-label,'
if (css.includes(b)) { console.log('css class already'); process.exit(0) }
if (!css.includes(a)) { console.error('selector missing'); process.exit(1) }
css = css.split(a).join(b)
const a2 = '.ai-composer-bar .ai-safety-chip > span:not(.ai-chip-cap) {'
const b2 = '.ai-composer-bar .ai-safety-chip .ai-safety-chip-label {'
if (css.includes(a2)) css = css.split(a2).join(b2)
fs.writeFileSync(path, css)
console.log('CSS selector updated to class')
