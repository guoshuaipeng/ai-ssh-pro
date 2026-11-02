import { readFileSync } from "node:fs"
import assert from "node:assert/strict"
const css = readFileSync("src/renderer/src/features.css", "utf8")
const start = css.indexOf("/* Settings: root/shell never scroll")
assert.ok(start > 0, "settings single-scroll block present")
const block = css.slice(start, css.indexOf("@container (max-width: 900px)", start))
assert.match(block, /\.settings-root \{[^}]*height:\s*100%/)
assert.match(block, /\.settings-root \{[^}]*overflow:\s*hidden/)
assert.match(block, /\.settings-shell \{[^}]*overflow:\s*hidden/)
assert.match(block, /\.settings-body \{[^}]*min-height:\s*0/)
assert.match(block, /\.settings-body \{[^}]*overflow:\s*auto/)
assert.equal(/max-width:\s*720px/.test(block.match(/\.settings-body \{[^}]*\}/)?.[0] ?? ""), false, "max-width must not clip settings-body height/width fill")
assert.match(block, /\.settings-body > section \{[^}]*max-width:\s*720px/)
console.log("test-settings-fill-height: 7 passed")
