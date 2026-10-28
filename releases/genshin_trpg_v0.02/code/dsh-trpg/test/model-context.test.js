import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { createTools } from '../lib/tools.js'
import { applyStateDelta, stateDelta, wireState } from '../engine/state-delta.js'
import { Journal } from '../engine/journal.js'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-model-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtime = new Runtime({ root, d6Source: () => 4 })
  const tools = createTools({ root, d6Source: () => 4 })
  let serial = 0
  const call = (tool, input, extra = {}) => runtime.execute({ tool, mode: 'solo', slot: 'case', input, requestId: `model_${++serial}`, ...extra })
  const render = (name, value, extra = {}) => JSON.parse(tools.find(tool => tool.name === name).output.render(extra, value)[0].text)
  return { root, runtime, tools, call, render }
}

test('增量精确恢复增删改、数组追加/滑窗与空值，不接受错误版本', () => {
  const before = { revision: 4, notes: ['a', 'b'], world: { facts: ['旧'], obsolete: true }, value: null }
  const after = { revision: 5, notes: ['b', 'c'], world: { facts: ['新'], added: 3 }, value: { ready: true } }
  const delta = stateDelta(before, after)
  assert.deepEqual(applyStateDelta(before, delta), after)
  assert.throws(() => applyStateDelta({ ...before, revision: 3 }, delta), /基线/)
  assert.deepEqual(before.notes, ['a', 'b'], 'decoder不能修改基线')
})

test('长团输出不重复旧叙事；完整状态、精确变化和重启恢复一致', t => {
  const f = fixture(t)
  let state = wireState(f.call('trpg_save', { op: 'demo' }).state)
  for (let i = 0; i < 35; i++) {
    const result = f.call('trpg_narrate', { text: `第${i}段：` + '风吹过城门，林川把纸笔装回袋里。'.repeat(30) })
    state = applyStateDelta(state, result.delta)
    assert.deepEqual(state, wireState(result.state))
    const model = f.render('trpg_narrate', result)
    assert.equal(model.stateComplete, false)
    assert.equal(model.current.revision, result.revision)
    assert.equal(model.delta.baseRevision, result.revision - 1)
  }
  const result = f.call('trpg_narrate', { text: '本次新叙事。' })
  const model = f.render('trpg_narrate', result)
  assert.ok(JSON.stringify(model).length < JSON.stringify(result).length / 3)
  assert.doesNotMatch(JSON.stringify(model), /第0段/)
  assert.deepEqual(f.render('trpg_narrate', result, { view: 'full' }), wireState(result))
  const recovered = new Runtime({ root: f.root }).execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'load' } })
  assert.deepEqual(recovered.state, result.state)
  assert.equal(f.render('trpg_save', recovered).state.revision, result.revision, '完整load不得投影成增量')
})

test('战斗渲染保留骰卡、伤害、后果和当前行动者，增量可重建所有战斗记录', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'demo' })
  f.call('trpg_scene', { op: 'open', goal: '守住通道', location: '城外', safe: false })
  let before = f.call('trpg_save', { op: 'load' }).state
  const start = f.call('trpg_combat', { op: 'start', enemies: [{ template: '丘丘暴徒' }] })
  assert.deepEqual(applyStateDelta(before, start.delta), wireState(start.state))
  before = start.state
  let checks = 0
  for (let i = 0; i < 20 && !before.battle.over; i++) {
    const turn = before.battle.order[before.battle.cursor]
    const result = !turn ? f.call('trpg_combat_advance', {})
      : turn.side === 'enemy' ? f.call('trpg_combat', { op: 'enemy' })
        : f.call('trpg_combat_attack', { actor: turn.id, action: 'attack', target: before.battle.enemies.find(enemy => enemy.hp > 0).id })
    const model = f.render('trpg_combat', result)
    assert.deepEqual(model.check, result.check)
    assert.deepEqual(model.damage, result.damage)
    assert.equal(model.publicSummary, result.publicSummary)
    assert.deepEqual(model.current.battle.currentTurn, result.state.battle.over ? null : result.state.battle.order[result.state.battle.cursor] ?? null)
    assert.equal(model.current.battle.history, undefined)
    assert.deepEqual(applyStateDelta(before, model.delta), wireState(result.state))
    if (result.check) checks++
    before = result.state
  }
  assert.ok(checks > 0)
  assert.equal(new Journal(f.root, 'solo', 'case').verify().valid, true)
})

test('幂等重放发送最新完整状态；失败与无效view不会落档', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'demo' })
  const requestId = 'fixed_damage'
  const first = f.call('trpg_apply', { actor: 'pc', damage: 5, reason: '跌倒' }, { requestId })
  f.call('trpg_narrate', { text: '稍后到达城门。' })
  const replay = f.call('trpg_apply', { actor: 'pc', damage: 5, reason: '跌倒' }, { requestId })
  assert.equal(replay.replayed, true)
  assert.equal(replay.state.characters.pc.state.hp, first.state.characters.pc.state.hp)
  assert.equal(f.render('trpg_apply', replay).state.revision, replay.revision)
  const before = f.call('trpg_save', { op: 'load' }).state
  assert.throws(() => f.call('trpg_apply', { actor: 'pc', damage: 1, reason: '过期' }, { expectedRevision: 1 }), /状态已更新/)
  assert.throws(() => f.tools.find(tool => tool.name === 'trpg_narrate').execute({ mode: 'solo', slot: 'case', input: { text: '不应写入' }, view: 'bad' }), /view/)
  assert.deepEqual(f.call('trpg_save', { op: 'load' }).state, before)
})

test('输出变化仅来自publicState，不带隐藏设置或内部来源列表', t => {
  const f = fixture(t)
  f.call('trpg_save', { op: 'demo' })
  const journal = new Journal(f.root, 'solo', 'case')
  const raw = journal.load()
  raw.settings.private = 'GM_SECRET'
  raw.sources.push('INTERNAL_SOURCE')
  journal.appendRawForTest(raw)
  const result = f.call('trpg_narrate', { text: '街道安静下来。' })
  const rendered = JSON.stringify(f.render('trpg_narrate', result))
  assert.doesNotMatch(rendered, /GM_SECRET|INTERNAL_SOURCE/)
})
