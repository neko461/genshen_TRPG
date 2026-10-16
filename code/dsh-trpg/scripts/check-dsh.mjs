import assert from 'node:assert/strict'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { apply } from '../lib/index.js'

// Exercise the real host schema compiler and adapter, without creating a save.
const registered = []
apply({ tools: { register(tool) { registered.push(tool) } } })
assert.equal(registered.length, 19)
assert.equal(new Set(registered.map(tool => tool.name)).size, 19)
for (const tool of registered) {
  assert.equal(typeof tool.execute, 'function')
  assert.ok(tool.parameters)
}
assert.equal(typeof defineTool, 'function')
const rules = registered.find(tool => tool.name === 'trpg_rules')
const args = { mode: 'solo', slot: 'dsh_check', input: {} }
const result = await rules.execute(args, { signal: new AbortController().signal })
assert.ok(result)
assert.equal(rules.output.render(args, result)[0].type, 'text')
await assert.rejects(() => rules.execute({ ...args, mode: 'invalid' }, {}))
console.log('DSH 检查通过：19 个真实工具注册、只读调用、结果呈现与参数校验正常；未创建存档。')
