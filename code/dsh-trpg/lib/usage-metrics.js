import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null
const agentId = agent => typeof agent === 'string' ? agent : agent?.id

/** Only provider-supplied numbers are recorded. Never record messages, raw chunks or tool inputs. */
export function createUsageMetrics(root, { enabled = true, maxBytes = 2 * 1024 * 1024 } = {}) {
  const sessions = new Set(), seen = new Set()
  const file = path.join(root, 'save', 'telemetry', 'dsh-usage.jsonl')
  return {
    file,
    track(agent) {
      const id = agentId(agent)
      if (!enabled || !id) return
      sessions.add(id)
      if (sessions.size > 128) sessions.delete(sessions.values().next().value)
    },
    observe({ agent, frame } = {}) {
      const id = agentId(agent)
      if (!enabled || !sessions.has(id) || frame?.type !== 'chunk' || frame.chunk?.type !== 'usage') return
      const key = `${id}/${frame.attemptId}`
      if (seen.has(key)) return
      const usage = frame.chunk.usage
      if (count(usage?.inputTokens) === null || count(usage?.outputTokens) === null) return
      const row = {
        at: new Date().toISOString(), source: 'dsh-agent-assistant-stream',
        session: createHash('sha256').update(id).digest('hex').slice(0, 16),
        inputTokens: usage.inputTokens, outputTokens: usage.outputTokens,
        cacheReadTokens: count(usage.cacheReadTokens), cacheWriteTokens: count(usage.cacheWriteTokens), totalTokens: count(usage.totalTokens),
      }
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        if (fs.existsSync(file) && fs.statSync(file).size >= maxBytes) fs.renameSync(file, `${file}.1`)
        fs.appendFileSync(file, JSON.stringify(row) + '\n')
        seen.add(key)
        if (seen.size > 2048) seen.delete(seen.values().next().value)
      } catch { /* Optional telemetry cannot turn a committed game action into an error. */ }
    },
  }
}

export function summarizeUsage(rows) {
  const fields = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens']
  return { calls: rows.length, ...Object.fromEntries(fields.map(field => [field, {
    reportedCalls: rows.filter(row => count(row[field]) !== null).length,
    sum: rows.reduce((sum, row) => sum + (count(row[field]) ?? 0), 0),
  }])) }
}
