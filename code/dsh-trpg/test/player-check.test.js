import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { Runtime } from '../engine/runtime.js'
import { createTools } from '../lib/tools.js'
import { parsePlayerDice } from '../lib/player-check.js'

function fixture(t, askPlayer) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-player-'))
  t.after(() => { assert.equal(path.dirname(root), os.tmpdir()); fs.rmSync(root, { recursive: true, force: true }) })
  const runtime = new Runtime({ root })
  const call = (tool, input) => runtime.execute({ tool, input, mode: 'solo', slot: 'test' })
  call('trpg_save', { op: 'demo' })
  call('trpg_scene', { op: 'open', goal: '追踪足迹' })
  const check = createTools({ root, askPlayer, d6Source: () => 4 }).find(t => t.name === 'trpg_check')
  const args = { mode: 'solo', slot: 'test', requestId: 'player_check_1', input: { actor: 'pc', attribute: '感知', tag: '野外追踪', purpose: '追踪足迹', waitForPlayer: true } }
  return { root, call, check, args, read: () => call('trpg_save', { op: 'load' }).state }
}

test('等待玩家期间无写入，手动两个骰面按既定修正结算并保持重试幂等', async t => {
  let answer, askCount = 0, question
  const f = fixture(t, request => { askCount++; question = request; return new Promise(resolve => { answer = resolve }) })
  const before = f.read()
  const pending = f.check.execute(f.args, {})
  assert.deepEqual(f.read(), before)
  assert.match(question.questions[0].question, /感知 \+1/)
  answer({ answers: [{ id: f.args.requestId, selected: [], custom: '4,3' }] })
  const result = await pending
  assert.deepEqual(result.check.dice, [4, 3])
  assert.equal(result.check.total, 9)
  assert.equal(f.read().scene.checks.length, 1)
  const retry = await f.check.execute(f.args, {})
  assert.equal(retry.replayed, true)
  assert.equal(askCount, 1)
})

test('字符串对象在工具分流前还原，不绕过玩家等待且兼容对象重试', async t => {
  let answer, asks = 0
  const f = fixture(t, () => { asks++; return new Promise(resolve => { answer = resolve }) })
  const before = f.read()
  const pending = f.check.execute({ ...f.args, input: JSON.stringify(f.args.input) }, {})
  assert.equal(asks, 1)
  assert.deepEqual(f.read(), before)
  answer({ answers: [{ id: f.args.requestId, selected: ['掷骰'] }] })
  assert.deepEqual((await pending).check.dice, [4, 4])
  const settled = f.read()
  assert.equal((await f.check.execute(f.args, {})).replayed, true)
  assert.deepEqual(f.read(), settled)
  assert.equal(asks, 1)
})

test('选择掷骰使用引擎随机源，取消不消耗检定次数', async t => {
  let cancel = true
  const f = fixture(t, async request => ({ answers: [{ id: request.questions[0].id, selected: [cancel ? '暂不检定' : '掷骰'] }] }))
  const before = f.read()
  assert.equal((await f.check.execute(f.args, {})).cancelled, true)
  assert.deepEqual(f.read(), before)
  cancel = false
  assert.deepEqual((await f.check.execute(f.args, {})).check.dice, [4, 4])
})

test('只接受两个合法骰面，不把合计或GM代填参数当玩家答案', async t => {
  for (const invalid of ['10', '0,6', '7,2', '4,3,2', '掷出六点']) assert.throws(() => parsePlayerDice(invalid), /两个/)
  for (const valid of ['4,3', '4，3', '4 + 3', '4 3']) assert.deepEqual(parsePlayerDice(valid), [4, 3])
  const f = fixture(t, async request => ({ answers: [{ id: request.questions[0].id, custom: '10', selected: [] }] }))
  const before = f.read()
  await assert.rejects(f.check.execute(f.args, {}), /两个/)
  await assert.rejects(f.check.execute({ ...f.args, input: { ...f.args.input, dice: [6, 6] } }, {}), /GM/)
  assert.deepEqual(f.read(), before)
})

test('玩家作答期间状态变化会拒绝旧条件，不静默改变修正或扣次数', async t => {
  let resolve
  const f = fixture(t, () => new Promise(r => { resolve = r }))
  const pending = f.check.execute(f.args, {})
  f.call('trpg_narrate', { text: '并发会话更新了状态' })
  const changed = f.read()
  resolve({ answers: [{ id: f.args.requestId, selected: ['掷骰'] }] })
  await assert.rejects(pending, /状态已更新/)
  assert.deepEqual(f.read(), changed)
})

test('不存在角色等非法条件在提问前拒绝，同一槽位不重复提问', async t => {
  let asks = 0, resolve
  const f = fixture(t, () => { asks++; return new Promise(r => { resolve = r }) })
  await assert.rejects(f.check.execute({ ...f.args, input: { ...f.args.input, actor: 'missing' } }, {}), /找不到角色/)
  assert.equal(asks, 0)
  const pending = f.check.execute(f.args, {})
  await assert.rejects(f.check.execute({ ...f.args, requestId: 'other_question' }, {}), /已有等待/)
  resolve({ answers: [{ id: f.args.requestId, selected: ['暂不检定'] }] })
  await pending
  assert.equal(asks, 1)
})

test('取消信号或没有回答入口不会降级为自动掷骰', async t => {
  const f = fixture(t, undefined)
  const before = f.read()
  await assert.rejects(f.check.execute(f.args, {}), /没有玩家回答入口/)
  const abort = new AbortController()
  const tool = createTools({ root: f.root, askPlayer: async request => {
    abort.abort()
    return { answers: [{ id: request.questions[0].id, selected: ['掷骰'] }] }
  } }).find(t => t.name === 'trpg_check')
  await assert.rejects(tool.execute(f.args, { signal: abort.signal }), /取消/)
  assert.deepEqual(f.read(), before)
})

function combatFixture(t, askPlayer, name = 'trpg_combat_attack') {
  const f = fixture(t, askPlayer)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '丘丘人', id: 'enemy' }] })
  const tool = createTools({ root: f.root, askPlayer, d6Source: () => 4 }).find(tool => tool.name === name)
  const args = { ...f.args, requestId: 'combat_player_1', input: { actor: 'pc', target: 'enemy', action: 'skill', waitForPlayer: true, ...(name === 'trpg_combat' ? { op: 'act' } : {}) } }
  return { ...f, tool, args }
}

test('战斗等待不改变HP/能量/回合，手动骰结算并幂等重试', async t => {
  let answer, asks = 0
  const f = combatFixture(t, request => { asks++; return new Promise(resolve => { answer = resolve }) })
  const before = f.read()
  const pending = f.tool.execute(f.args, {})
  assert.deepEqual(f.read(), before)
  answer({ answers: [{ id: f.args.requestId, custom: '4,3' }] })
  const result = await pending
  assert.deepEqual(result.check.dice, [4, 3])
  assert.equal(result.state.characters.pc.state.elemental_energy, before.characters.pc.state.elemental_energy - 1)
  assert.equal(result.state.battle.acted.pc, 1)
  const settled = f.read()
  assert.equal((await f.tool.execute(f.args, {})).replayed, true)
  assert.deepEqual(f.read(), settled)
  assert.equal(asks, 1)
})

test('战斗取消/非法骰面不耗行动或资源，兼容combat act入口', async t => {
  let custom = '', selected = ['暂不检定']
  const f = combatFixture(t, async request => ({ answers: [{ id: request.questions[0].id, custom, selected }] }), 'trpg_combat')
  const before = f.read()
  assert.equal((await f.tool.execute(f.args, {})).cancelled, true)
  assert.deepEqual(f.read(), before)
  custom = '12'; selected = []
  await assert.rejects(f.tool.execute(f.args, {}), /两个/)
  assert.deepEqual(f.read(), before)
  custom = ''; selected = ['掷骰']
  assert.deepEqual((await f.tool.execute(f.args, {})).check.dice, [4, 4])
})

test('战斗等待校验回合和版本，拒绝无骰动作与GM代填', async t => {
  let answer, asks = 0
  const f = combatFixture(t, () => { asks++; return new Promise(resolve => { answer = resolve }) })
  const before = f.read()
  await assert.rejects(f.tool.execute({ ...f.args, input: { ...f.args.input, action: 'defend' } }, {}), /不需要掷骰/)
  await assert.rejects(f.tool.execute({ ...f.args, input: { ...f.args.input, dice: [6, 6] } }, {}), /GM/)
  await assert.rejects(f.tool.execute({ ...f.args, input: { ...f.args.input, actor: 'traveler' } }, {}), /玩家角色/)
  assert.equal(asks, 0)
  assert.deepEqual(f.read(), before)
  const pending = f.tool.execute(f.args, {})
  f.call('trpg_narrate', { text: '等待中状态更新' })
  const changed = f.read()
  answer({ answers: [{ id: f.args.requestId, selected: ['掷骰'] }] })
  await assert.rejects(pending, /状态已更新/)
  assert.deepEqual(f.read(), changed)
})
