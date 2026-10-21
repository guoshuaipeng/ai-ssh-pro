import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
// V47 P2: SFTP row fills width so the summary sits right; AI status line padded; update badge collapses to a dot with tooltip
const css = readFileSync('src/renderer/src/features.css', 'utf8')
assert.match(css, /\.sftp-toolbar \.sftp-toolbar-actions \{ flex: 1 1 auto; min-width: 0; \}/)
assert.match(css, /\.sftp-toolbar \.sftp-queue-summary \{ order: 4; margin-left: auto;/)
assert.match(css, /\.ai-conv-general \{[^}]*padding: var\(--space-2\) var\(--space-3\)/)
assert.match(css, /\.app-toolbar-update-badge \.app-toolbar-update-text \{ display: none; \}/)
const tb = readFileSync('src/renderer/src/components/AppToolbar.tsx', 'utf8')
assert.match(tb, /data-testid="update-badge" title=\{t\('upd.badge'/)
console.log('test-visual-p2 ok')