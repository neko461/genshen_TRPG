import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createUsageMetrics, summarizeUsage } from '../lib/usage-metrics.js'
import { apply } from '../lib/index.js'

test('仅记录跑团会话的宿主usage数字，重复帧去重，缺失统计保持null', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-usage-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const metrics = createUsageMetrics(root)
  const event = { agent: { id: 'session-test' }, frame: { type: 'chunk', attemptId: 'attempt-1', chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, totalTokens: 170, private: 'SECRET' } } } }
  metrics.observe(event)
  assert.equal(fs.existsSync(metrics.file), false)
  metrics.track(event.agent)
  metrics.observe(event); metrics.observe(event)
  const rows = fs.readFileSync(metrics.file, 'utf8').trim().split('\n').map(JSON.parse)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].cacheWriteTokens, null)
  assert.equal(rows[0].inputTokens, 100)
  assert.doesNotMatch(JSON.stringify(rows), /session-test|attempt-1|SECRET/)
  const summary = summarizeUsage(rows)
  assert.equal(summary.totalTokens.sum, 170)
  assert.equal(summary.cacheWriteTokens.reportedCalls, 0)
  assert.equal(summary.cacheReadTokens.sum, 50)
})

test('禁用、非usage帧和日志写入失败不影响游戏调用', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-usage-off-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const event = { agent: { id: 'test' }, frame: { type: 'chunk', attemptId: 'a', chunk: { type: 'usage', usage: { inputTokens: 1, outputTokens: 1 } } } }
  const disabled = createUsageMetrics(root, { enabled: false })
  disabled.track(event.agent); disabled.observe(event)
  assert.equal(fs.existsSync(disabled.file), false)
  const metrics = createUsageMetrics(root)
  metrics.track(event.agent)
  metrics.observe({ ...event, frame: { type: 'chunk', chunk: { type: 'text-delta', text: '不可记录' } } })
  assert.equal(fs.existsSync(metrics.file), false)
  fs.writeFileSync(path.join(root, 'save'), '阻止创建日志目录')
  assert.doesNotThrow(() => metrics.observe(event))
})

test('插件实际注册宿主usage事件，并仅跟踪调用过跑团工具的会话', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-usage-hook-'))
  const previousRoot = process.env.TRPG_ROOT
  process.env.TRPG_ROOT = root
  t.after(() => {
    if (previousRoot === undefined) delete process.env.TRPG_ROOT
    else process.env.TRPG_ROOT = previousRoot
    fs.rmSync(root, { recursive: true, force: true })
  })
  const registered = [], listeners = {}
  apply({ tools: { register(tool) { registered.push(tool) } }, on(event, listener) { listeners[event] = listener } })
  assert.equal(typeof listeners['agent/assistant-stream'], 'function')
  const agent = { id: 'only-this-game' }
  registered.find(tool => tool.name === 'trpg_rules').execute({ mode: 'solo', slot: 'case', input: { scope: 'checks' } }, { agent })
  listeners['agent/assistant-stream']({ agent, frame: { type: 'chunk', attemptId: 'a', chunk: { type: 'usage', usage: { inputTokens: 12, outputTokens: 7 } } } })
  const file = path.join(root, 'save', 'telemetry', 'dsh-usage.jsonl')
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).inputTokens, 12)
})
