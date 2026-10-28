import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { summarizeUsage } from '../lib/usage-metrics.js'

const root = path.resolve(process.env.TRPG_ROOT || fileURLToPath(new URL('../../..', import.meta.url)))
const file = path.join(root, 'save', 'telemetry', 'dsh-usage.jsonl')
if (!fs.existsSync(file)) console.log('尚无实际模型用量记录。重载插件并在DSH中调用跑团工具后，后续请求的usage会记入本地统计；无usage数据时不估算token。')
else {
  const rows = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  console.log(JSON.stringify(summarizeUsage(rows), null, 2))
  console.log('inputTokens为未命中缓存的输入；cacheReadTokens/cacheWriteTokens单列。reportedCalls=0表示未报告，不表示用量为零。仅汇总当前日志，轮转旧日志另存为.1。')
}
