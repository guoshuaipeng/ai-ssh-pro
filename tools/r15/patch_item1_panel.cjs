const fs = require('fs')
const path = 'src/renderer/src/components/AIPanel.tsx'
let src = fs.readFileSync(path, 'utf8')
if (src.includes('ai-safety-chip-label')) {
  console.log('chip label already present')
  process.exit(0)
}
const old = '<span>{tg(`policy.${aiPolicy.effective}` as \'policy.ask\')}</span>'
const neu = '<span className="ai-safety-chip-label">{tg(`policy.${aiPolicy.effective}` as \'policy.ask\')}</span>'
if (!src.includes(old)) {
  // try double-quote variant / different formatting
  const re = /<span>\{tg\(`policy\.\$\{aiPolicy\.effective\}` as 'policy\.ask'\)\}<\/span>/
  if (!re.test(src)) {
    console.error('chip label span not found')
    process.exit(1)
  }
  src = src.replace(re, '<span className="ai-safety-chip-label">{tg(`policy.${aiPolicy.effective}` as \'policy.ask\')}</span>')
} else {
  src = src.replace(old, neu)
}
fs.writeFileSync(path, src)
console.log('AIPanel chip label class added')
