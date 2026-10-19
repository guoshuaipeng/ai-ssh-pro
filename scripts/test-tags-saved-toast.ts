/** editProfileTags toasts saved/cleared. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const app = readFileSync('src/renderer/src/App.tsx', 'utf8')
assert.match(app, /tags\.saved/)
assert.match(app, /tags\.cleared/)
assert.match(app, /showToast\(tags\.length \? tg\('tags\.saved'/)

const i18n = readFileSync('src/renderer/src/lib/i18n.tsx', 'utf8')
assert.ok(i18n.includes("tags.saved': '已保存标签：{tags}'"))
assert.ok(i18n.includes("tags.saved': 'Tags saved: {tags}'"))
assert.ok(i18n.includes("tags.cleared': '已清除标签'"))
assert.ok(i18n.includes("tags.cleared': 'Tags cleared'"))

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string; scripts: { test: string; 'test:parts'?: string } }
assert.equal(pkg.version, '0.6.57')
assert.match(pkg.scripts['test:parts'] || pkg.scripts.test, /test-tags-saved-toast/)
console.log('test-tags-saved-toast ok')
