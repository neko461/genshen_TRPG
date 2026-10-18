import assert from 'node:assert/strict'
import fs from 'node:fs'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { apply } from '../lib/index.js'

// Exercise the real host schema compiler and adapter, without creating a save.
const registered = []
let checkpointRoute
apply({
  tools: { register(tool) { registered.push(tool) } },
  connection: { fetch: { register(route) { checkpointRoute = route; return () => {} } } },
  effect(run) { return run() },
})
assert.equal(registered.length, 19)
assert.equal(new Set(registered.map(tool => tool.name)).size, 19)
for (const tool of registered) {
  assert.equal(typeof tool.execute, 'function')
  assert.ok(tool.parameters)
}
assert.equal(typeof defineTool, 'function')
assert.equal(checkpointRoute.path, '/api/trpg-checkpoints')
assert.deepEqual(checkpointRoute.methods, ['POST'])
const slotsResponse = await checkpointRoute.fetch(new Request('http://localhost/api/trpg-checkpoints', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ op: 'slots', mode: 'solo', slot: 'dsh_check' }),
}))
assert.equal(slotsResponse.status, 200)
const slotsPayload = await slotsResponse.json()
assert.equal(slotsPayload.ok, true)
assert.ok(Array.isArray(slotsPayload.result.slots))
if (slotsPayload.result.slots.length) {
  const listResponse = await checkpointRoute.fetch(new Request('http://localhost/api/trpg-checkpoints', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ op: 'list', mode: 'solo', slot: slotsPayload.result.slots[0] }),
  }))
  assert.equal(listResponse.status, 200)
  const listPayload = await listResponse.json()
  assert.equal(listPayload.ok, true)
  assert.ok(Array.isArray(listPayload.result.checkpoints))
}
const rules = registered.find(tool => tool.name === 'trpg_rules')
const args = { mode: 'solo', slot: 'dsh_check', input: {} }
const result = await rules.execute(args, { signal: new AbortController().signal })
assert.ok(result)
assert.equal(rules.output.render(args, result)[0].type, 'text')
await assert.rejects(() => rules.execute({ ...args, mode: 'invalid' }, {}))
const character = registered.find(tool => tool.name === 'trpg_char')
assert.match(character.description, /input:\{op:"guidance",topic:/)
const guidanceArgs = { mode: 'solo', slot: 'dsh_check', input: { op: 'guidance', topic: 'writing' } }
const guidance = await character.execute(guidanceArgs, { signal: new AbortController().signal })
assert.equal(guidance.audience, 'GM')
assert.match(JSON.stringify(guidance), /玩家明确写出的行动范围、禁止事项、条件和停止点/)
assert.match(JSON.stringify(guidance), /检定卡的目的也必须与玩家授权一致/)
assert.equal(fs.existsSync(new URL('../../../save/slots/solo/dsh_check', import.meta.url)), false)
console.log('DSH 检查通过：19 个工具注册、存档路由只读枚举、writing 指引可读取、参数校验正常；未创建或改写存档。')
