const fs = require('fs')
const path = 'src/renderer/src/styles.css'
let css = fs.readFileSync(path, 'utf8')
if (css.includes('R15 Round15: composer policy menu narrow')) {
  console.log('CSS item1 already present')
  process.exit(0)
}
const insertAfter = '/* H02: suggest-only decision row — copy is the primary action, never Agree. */'
const at = css.indexOf(insertAfter)
if (at < 0) {
  console.error('H02 marker missing')
  process.exit(1)
}
const block = `/* R15 Round15: composer policy menu narrow — chips wrap, menu readable */
.ai-composer-bar {
  flex-wrap: wrap;
  row-gap: var(--space-1);
  align-items: center;
}
.ai-composer-bar .ai-safety-chip,
.ai-composer-bar .ai-model-chip {
  max-width: 100%;
}
.ai-composer-bar .ai-safety-chip > span:not(.ai-chip-cap),
.ai-composer-bar .ai-model-chip .ai-model-chip-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 8.5em;
}
.ai-composer-bar .ai-chip-menu.ai-safety-pop {
  box-sizing: border-box;
  width: 100%;
  max-height: min(320px, 70vh);
}
.ai-composer-bar .ai-safety-pop .ai-safety-head {
  flex-wrap: wrap;
  align-items: flex-start;
  row-gap: var(--space-1);
}
.ai-composer-bar .ai-safety-pop .ai-safety-title {
  flex: 1 1 auto;
  min-width: 0;
  white-space: normal;
}
.ai-composer-bar .ai-chip-menu-label {
  white-space: normal;
  overflow: visible;
  text-overflow: unset;
}
.ai-composer-bar .ai-run-steps {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
@container (max-width: 230px) {
  .ai-composer-bar .ai-model-chip {
    max-width: 88px;
    min-width: 48px;
  }
  .ai-composer-bar .ai-safety-chip > span:not(.ai-chip-cap) {
    max-width: 5.5em;
  }
  .ai-composer-bar .ai-run-steps {
    flex: 1 1 100%;
    order: 8;
  }
  .ai-composer-bar .ai-composer-spacer {
    display: none;
  }
}

`
css = css.slice(0, at) + block + insertAfter + css.slice(at + insertAfter.length)
fs.writeFileSync(path, css)
console.log('CSS item1 patched')
