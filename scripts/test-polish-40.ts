/** P40: narrow SFTP column priority, find bar vs paste preview, FAB gutter. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.sftp-pane \{ container-type: inline-size; \}/)
assert.match(css, /@container \(max-width: 480px\) \{\s*\.sftp-table th:nth-child\(4\),\s*\.sftp-table td:nth-child\(4\) \{ display: none; \}/)
assert.match(css, /\.terminal-pane-wrap:has\(\.terminal-find-bar\) \.paste-preview \{ top: 52px; \}/)
assert.match(css, /\.session-command-fab \{ right: 12px; bottom: 12px;[^}]*opacity: \.6/)
assert.match(css, /\.session-command-fab:hover, \.session-command-fab:focus-visible \{ opacity: 1; \}/)
// column 4 is modified time in both panes (checkbox, name, size, modified[, perm])
const sp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
const head = sp.slice(sp.indexOf('<thead>'), sp.indexOf('</thead>'))
assert.ok(head.indexOf("'d1.perm'") > head.lastIndexOf('<th'), 'perm stays last')
console.log('test-polish-40 ok')
