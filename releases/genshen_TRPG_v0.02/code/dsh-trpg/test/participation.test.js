import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { Journal } from '../engine/journal.js'

function fixture(t, demo = false) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-presence-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const r = new Runtime({ root, d6Source: () => 4, random: () => 0 })
  let n = 0
  const call = (tool, input, requestId = `p_${++n}`) => r.execute({ tool, mode: 'solo', slot: 'case', input, requestId })
  const read = () => call('trpg_save', { op: 'load' }).state
  call('trpg_save', { op: demo ? 'demo' : 'new' })
  if (!demo) call('trpg_char', { op: 'create', id: 'pc', name: '测试者' })
  const party = (action, extra = {}) => call('trpg_party', { op: 'traveler', action, reason: '测试实际事件', ...extra })
  const open = () => call('trpg_scene', { op: 'open', goal: '调查风灾现场', location: '林地', safe: true })
  const battle = (template = '丘丘人') => call('trpg_combat', { op: 'start', enemies: [{ id: 'e', template }] })
  return { root, call, read, party, open, battle, journal: new Journal(root, 'solo', 'case') }
}

test('新团不自动结识旅行者，主线调查和独行战斗不需要他', t => {
  const f = fixture(t)
  assert.equal(f.read().characters.traveler, undefined)
  assert.deepEqual(f.call('trpg_party', { op: 'status' }).traveler, { met: false, joined: false, present: false })
  f.open()
  assert.deepEqual(f.read().scene.members, ['pc'])
  f.call('trpg_check', { actor: 'pc', attribute: '感知', purpose: '核实风灾证据' })
  f.call('trpg_state', { op: 'addThread', id: 'dragon_tracks', text: '将实际取得的证据交骑士团鉴定' })
  assert.throws(() => f.call('trpg_check', { actor: 'pc', helpers: ['traveler'] }), /不在当前场景/)
  f.battle('急冻树')
  const b = f.read().battle
  assert.deepEqual(b.party.map(a => a.id), ['pc'])
  assert.equal(b.independentSolo, true)
  assert.deepEqual([b.enemies[0].max_hp, b.enemies[0].aoe, b.enemies[0].single], [65, 18, 20])
  assert(f.read().world.threads.some(x => x.id === 'dragon_tracks'))
})

test('结识不等于入队，同行须同意，暂离归队保留角色和关系', t => {
  const f = fixture(t); f.open()
  assert.throws(() => f.party('join', { playerConfirmed: true }), /须先实际结识/)
  f.party('meet')
  assert(f.read().characters.traveler)
  assert.deepEqual(f.read().scene.members, ['pc'])
  const before = f.read()
  assert.throws(() => f.party('join'), /玩家明确同意/)
  assert.deepEqual(f.read(), before)
  f.party('join', { playerConfirmed: true })
  f.call('trpg_relation', { op: 'raise', actor: 'traveler', npc: 'pc', sourceId: 'shared', reason: '实际相识' })
  assert.deepEqual(f.read().scene.members, ['pc', 'traveler'])
  f.party('leave')
  assert.deepEqual(f.read().scene.members, ['pc'])
  assert.throws(() => f.call('trpg_check', { actor: 'pc', helpers: ['traveler'] }), /不在当前场景/)
  assert.throws(() => f.call('trpg_check', { actor: 'traveler', allowTraveler: true }), /不在当前场景/)
  assert.throws(() => f.call('trpg_party', { op: 'unlock', element: '风', reason: '不在场' }), /须实际在场/)
  f.party('return')
  assert.equal(f.read().characters.traveler.relations.pc, '相识')
  assert.deepEqual(f.read().scene.members, ['pc', 'traveler'])
  f.party('dismiss')
  assert.throws(() => f.party('return'), /暂时不在场/)
  assert.equal(f.read().party.traveler.met, true)
  assert.equal(f.read().party.traveler.joined, false)
})

test('明确拒绝见面不能被GM悄悄撤销，已提交同行请求幂等', t => {
  const f = fixture(t)
  f.call('trpg_state', { op: 'set', flagKey: 'no_traveler_premise', flagValue: true, reason: '玩家拒绝见面' })
  const before = f.read()
  assert.throws(() => f.party('meet'), /改变偏好须玩家确认/)
  assert.deepEqual(f.read(), before)
  f.party('meet', { playerConfirmed: true })
  const input = { op: 'traveler', action: 'join', playerConfirmed: true, reason: '玩家后来主动同意' }
  const first = f.call('trpg_party', input, 'join_once')
  const replay = f.call('trpg_party', input, 'join_once')
  assert.equal(replay.replayed, true)
  assert.equal(replay.revision, first.revision)
})

test('不在场同伴不受物品、短休、休整或奖励治疗影响', t => {
  const f = fixture(t, true); f.open()
  f.call('trpg_apply', { actor: 'traveler', hp: -40, energy: -2, reason: '先前消耗' })
  f.party('leave')
  const before = f.read().characters.traveler.state
  assert.throws(() => f.call('trpg_item', { op: 'use', actor: 'pc', item: 'food', target: 'traveler' }), /须在当前场景/)
  f.call('trpg_check', { actor: 'pc', attribute: '感知' })
  const short = f.call('trpg_scene', { op: 'close' })
  assert.deepEqual(short.recovery.map(a => a.actor), ['pc'])
  f.call('trpg_recover', { level: '休整', reason: '玩家在旅店休整，旅行者在外' })
  f.open()
  const j = f.journal
  j.commit('test_gear', {}, s => { s.characters.traveler.derived.three = '冒险家'; return { state: s, result: {} } })
  f.call('trpg_item', { op: 'reward', kind: '宝箱', sourceId: 'chest', reason: '玩家发现宝箱' })
  assert.deepEqual(f.read().characters.traveler.state, before)
})

test('独行时敌人群攻/单体只选当前参战者，不能远程协助和治疗', t => {
  const f = fixture(t, true); f.open(); f.party('leave'); f.battle('急冻树')
  const before = f.read()
  assert.throws(() => f.party('return'), /战斗中/)
  assert.throws(() => f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'assist', target: 'traveler' }), /不在本场战斗/)
  assert.throws(() => f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'heal', target: 'traveler' }), /不在本场战斗/)
  assert.deepEqual(f.read(), before)
  f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'defend' })
  const result = f.call('trpg_combat', { op: 'enemy' })
  assert(result.events.length > 0)
  assert(result.events.every(e => !e.target || e.target === 'pc'))
  assert.deepEqual(f.read().characters.traveler.state, before.characters.traveler.state)
})

test('已有同行存档保持原强度，明确无同行旧档兼容过滤且只读不写日志', t => {
  for (const avoid of [false, true]) {
    const f = fixture(t, true)
    f.journal.commit('test_legacy', {}, s => {
      delete s.party
      if (avoid) s.world.flags.no_traveler_premise = true
      return { state: s, result: {} }
    })
    const before = f.journal.verify()
    assert.equal(f.call('trpg_party', { op: 'status' }).traveler.present, !avoid)
    const loaded = f.call('trpg_save', { op: 'load' })
    // The host rejects own properties with undefined even though stringify
    // silently drops them. Old save projections must be lossless JSON too.
    assert.deepEqual(JSON.parse(JSON.stringify(loaded)), loaded)
    assert.equal(loaded.state.party.traveler.present, !avoid)
    assert.equal(f.journal.load().party, undefined)
    assert.deepEqual(f.journal.verify(), before)
    f.open(); f.battle('急冻树')
    const s = f.read()
    assert.equal(s.party.traveler.present, !avoid)
    assert.deepEqual(s.battle.party.map(a => a.id), avoid ? ['pc'] : ['pc', 'traveler'])
    assert.deepEqual([s.battle.enemies[0].max_hp, s.battle.enemies[0].aoe, s.battle.enemies[0].single], avoid ? [65, 18, 20] : [110, 18, 20])
  }
})
