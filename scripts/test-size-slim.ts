import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripWoffFallback } from '../src/shared/fontCss'

const css = `@font-face { src: url(./files/a.woff2) format('woff2'), url(./files/a.woff) format('woff'); unicode-range: U+0-FF; }`
const out = stripWoffFallback(css)
assert.ok(out.includes("url(./files/a.woff2) format('woff2')"))
assert.ok(!out.includes("a.woff)"))
assert.ok(out.includes('unicode-range'))
// woff-only source is kept (never drop the only font)
const only = `@font-face { src: url(./b.woff) format('woff'); }`
assert.equal(stripWoffFallback(only), only)
// real fontsource css: every face keeps a woff2
const real = readFileSync('node_modules/@fontsource/noto-sans-sc/chinese-simplified-400.css', 'utf8')
const slim = stripWoffFallback(real)
assert.equal((slim.match(/format\('woff'\)/g) || []).length, 0)
assert.equal((slim.match(/@font-face/g) || []).length, (slim.match(/format\('woff2'\)/g) || []).length)
// packaging config
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
for (const k of Object.keys(pkg.dependencies)) assert.ok(!k.startsWith('@fontsource/'), `${k} must be a devDependency`)
assert.deepEqual(pkg.build.electronLanguages, ['zh-CN', 'en-US'])
console.log('test-size-slim: ok')
