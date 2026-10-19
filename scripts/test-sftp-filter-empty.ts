/** SFTP empty state distinguishes name-filter misses. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const sftp = readFileSync('src/renderer/src/components/SftpPanel.tsx', 'utf8')
assert.match(sftp, /data-testid|testId=[\s\S]*sftp-filter-empty/)
assert.match(sftp, /sftp\.filterEmptyTitle/)
assert.match(sftp, /sftp\.filterEmptyDesc/)
assert.match(sftp, /nameFilter\.trim\(\)/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.match(i18n, /sftp\.filterEmptyTitle': '无匹配文件'/)
assert.match(i18n, /sftp\.filterEmptyTitle': 'No matches'/)
assert.match(i18n, /sftp\.filterEmptyDesc': '没有文件名包含「\{q\}」'/)
assert.match(i18n, /sftp\.filterEmptyDesc': 'No file names contain/)

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.62')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-sftp-filter-empty/)
console.log('test-sftp-filter-empty ok')
