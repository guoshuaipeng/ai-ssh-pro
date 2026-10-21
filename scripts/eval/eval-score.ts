import { readFileSync, writeFileSync } from 'node:fs'
import { parseTargets } from '../../src/shared/ai-actions'
import { parseAiAssistantReply } from '../../src/shared/ipc'
const r = JSON.parse(readFileSync(process.argv[2], 'utf8'))
if (r.error) { console.log('eval error:', r.error); process.exit(2) }
const pick = (raw: string) => { try { const m = raw.match(/\{[\s\S]*\}/); const o = m ? JSON.parse(m[0]) : null; return o?.appAction ?? (o?.action && o?.params ? { name: o.action, params: o.params } : null) } catch { return null } }
let nameOk = 0, paramOk = 0, rawLeak = 0, outLeak = 0
const rows: string[] = []
for (const c of r.out) {
  const rawP = pick(c.raw)
  const p = parseAiAssistantReply(c.raw)?.appAction ?? null // the production parser
  const nOk = p?.name === c.name
  let pOk = nOk
  if (nOk) for (const [k, v] of Object.entries(c.p)) {
    const got = String((p!.params as Record<string, unknown>)[k] ?? '')
    if (Array.isArray(v)) pOk &&= v.every((x) => parseTargets(got).map((s) => s.toLowerCase()).includes(String(x).toLowerCase()))
    else if (k === 'query' || k === 'title') pOk &&= got.toLowerCase().includes(String(v).toLowerCase())
    else pOk &&= got.trim() === String(v)
  }
  const rp = JSON.stringify(rawP?.params ?? {})
  const leakRaw = /"(password|privateKeyPath|passphrase)"\s*:\s*"[^"]+"/.test(rp) || (c.secret ? rp.includes(c.secret) : false)
  const leakOut = ['password', 'privateKeyPath', 'passphrase'].some((k) => k in (p?.params ?? {}))
  nameOk += +nOk; paramOk += +pOk; rawLeak += +leakRaw; outLeak += +leakOut
  rows.push(`| ${c.lang} | ${c.q} | ${c.name} | ${p?.name ?? '—'} | ${nOk ? '✅' : '❌'} | ${pOk ? '✅' : '❌'} | ${leakRaw ? '⚠️' : '—'} | ${leakOut ? '❌' : '—'} |`)
}
const n = r.out.length
const by = (lang: string) => { const xs = r.out.map((c: { lang: string }, i: number) => ({ c, row: rows[i] })).filter((x: { c: { lang: string } }) => x.c.lang === lang); return `${xs.filter((x: { row: string }) => x.row.split('|')[6].includes('✅')).length}/${xs.length}` }
const sum = `model=${r.model} cases=${n} action=${nameOk}/${n} params=${paramOk}/${n} (zh ${by('zh')}, en ${by('en')}) rawSecretFilled=${rawLeak} afterSanitize=${outLeak}`
writeFileSync(process.argv[3], `# c55 AI 动作真实模型评测\n\n${sum}\n\n| 语言 | 输入 | 期望 | 实际 | 动作 | 参数 | 模型原始输出含敏感值 | 净化后含敏感字段 |\n|---|---|---|---|---|---|---|---|\n${rows.join('\n')}\n`)
console.log(sum)
