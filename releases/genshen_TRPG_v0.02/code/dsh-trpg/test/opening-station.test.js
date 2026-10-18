import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'

function setup(t, slot = 'case') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-opening-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtime = new Runtime({ root, d6Source: () => 4, random: () => 0 })
  let seq = 0
  const call = (tool, input) => runtime.execute({ mode: 'solo', slot, tool, input, requestId: `opening_${++seq}` })
  return { call }
}

test('新档默认蒙德；玩家指定挪德卡莱时，开场文本与存档站点同步', t => {
  const f = setup(t)
  const defaultOpening = f.call('trpg_char', { op: 'opening' })
  assert.match(defaultOpening.opening, /故事从蒙德开始/)
  const selectedOpening = f.call('trpg_char', { op: 'opening', startStation: '挪德卡莱' })
  assert.match(selectedOpening.opening, /故事从挪德卡莱开始/)
  assert.doesNotMatch(selectedOpening.opening, /协会柜台|果酒湖/)
  assert.match(selectedOpening.gmInstructions, /远行要求改写成蒙德开场/)
  assert.match(selectedOpening.gmInstructions, /等玩家明确选择后再改新档起点/)
  f.call('trpg_save', { op: 'new', startStation: '挪德卡莱' })
  const state = f.call('trpg_save', { op: 'load' }).state
  assert.deepEqual(state.timeline, { index: 8, name: '挪德卡莱' })
  assert.equal(state.world.location, '挪德卡莱')
  assert.equal(state.world.startStationChosen, true)
  assert.match(state.notes.join('\n'), /更早站点未经历、未完成/)
  assert.deepEqual(state.world.flags, {})
})

test('已创建但尚未进入场景的新档可按玩家明确选择修正起点并保留角色', t => {
  const f = setup(t, 'late-choice')
  f.call('trpg_save', { op: 'new' })
  f.call('trpg_char', { op: 'create', id: 'pc', name: '行旅者', region: '蒙德' })
  const result = f.call('trpg_state', { op: 'startAtStation', station: '挪德卡莱', reason: '玩家明确要求开局直接前往挪德卡莱', playerConfirmed: true }).state
  assert.equal(result.timeline.index, 8)
  assert.equal(result.world.location, '挪德卡莱')
  assert.equal(result.characters.pc.name, '行旅者')
  assert.match(result.notes.join('\n'), /此前默认蒙德的开场文案不作为已发生事实/)
  assert.throws(() => f.call('trpg_state', { op: 'startAtStation', station: '璃月', reason: '再次改站', playerConfirmed: true }), /只能在尚未进入任何场景/)
})

test('起点修正须获玩家确认且不能在场景开始后改写', t => {
  const f = setup(t, 'locked')
  f.call('trpg_save', { op: 'new' })
  assert.throws(() => f.call('trpg_state', { op: 'startAtStation', station: '挪德卡莱', reason: 'GM猜测玩家想去', playerConfirmed: false }), /玩家明确选择/)
  f.call('trpg_scene', { op: 'open', goal: '蒙德现场调查', location: '蒙德城外' })
  assert.throws(() => f.call('trpg_state', { op: 'startAtStation', station: '挪德卡莱', reason: '玩家要求改写已经开始的场景', playerConfirmed: true }), /只能在尚未进入任何场景/)
  assert.equal(f.call('trpg_save', { op: 'load' }).state.timeline.name, '蒙德')
})
