// c55: uses the REAL chat system prompt (ai-stream buildMessages), so the eval matches production
import { writeFileSync, readFileSync } from 'node:fs'
import { buildMessages } from '../../src/main/ai-stream'
const cases = JSON.parse(readFileSync('scripts/eval/eval-cases.json', 'utf8'))
const system = buildMessages({ messages: [] } as never)[0].content
writeFileSync(process.argv[2], JSON.stringify({ system, cases }))
