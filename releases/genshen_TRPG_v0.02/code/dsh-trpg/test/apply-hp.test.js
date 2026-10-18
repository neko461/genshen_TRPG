import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { Journal } from '../engine/journal.js'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-apply-hp-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const r = new Runtime({ root, d6Source: () => 4, random: () => 0 })
  let n = 0
  const call = (tool, input = {}) => r.execute({ tool, mode: 'solo', slot: 'case', input, requestId: `a_${++n}` })
  const read = () => call('trpg_save', { op: 'load' }).state
  call('trpg_save', { op: 'demo' })
  const maxHp = read().characters.pc.state.max_hp
  // 让用例能精确控制 requestId，不靠内部计数器猜编号
  const resetIds = () => { n = 0 }
  return { root, r, call, read, maxHp, resetIds }
}

// 真实缺陷：2026-10-17 蒙德实机中 GM 传 {hp:132} 想把 HP 设成 132（当前 150），
// 引擎按增量解释为“治疗 +132”，被上限夹住变成 150→150，伤势完全没有落档，
// 而 GM 与玩家都以为扣了血。以下用例锁定“伤害必须真的落账”与“无效变更必须说出来”。

test('apply 的 damage 明确按伤害扣血，不受正 HP 增量夹持影响', t => {
  const f = fixture(t)
  const out = f.call('trpg_apply', { actor: 'pc', damage: 18, reason: '被横风推倒撞在岩壁上' })
  assert.equal(f.read().characters.pc.state.hp, f.maxHp - 18)
  assert.match(out.publicSummary, new RegExp(`HP ${f.maxHp}→${f.maxHp - 18}`), `publicSummary 须报出真实前后值，实际：${out.publicSummary}`)
  assert.match(out.publicSummary, /变化-18/)
})

test('apply 的 hp 仍是带符号增量：负为伤害、正为治疗', t => {
  const f = fixture(t)
  f.call('trpg_apply', { actor: 'pc', hp: -18, reason: '受伤' })
  assert.equal(f.read().characters.pc.state.hp, f.maxHp - 18)
  f.call('trpg_apply', { actor: 'pc', hp: 8, reason: '简单包扎' })
  assert.equal(f.read().characters.pc.state.hp, f.maxHp - 10)
})

test('apply 同时传 hp 与 damage 或有符号混用时拒绝，不写档', t => {
  const f = fixture(t)
  const before = f.read()
  for (const patch of [{ hp: -1, damage: 5 }, { heal: 5, damage: 5 }, { damage: -5 }, { heal: -5 }, { damage: 1.5 }, { heal: 0 }]) {
    assert.throws(() => f.call('trpg_apply', { actor: 'pc', reason: '非法组合', ...patch }), undefined, JSON.stringify(patch))
    assert.deepEqual(f.read(), before, `非法组合不得写档：${JSON.stringify(patch)}`)
  }
})

test('无效的 HP 变更要么被拒、要么明确告知，绝不静默通过', t => {
  const f = fixture(t)
  // 满血时治疗超出缺口：直接拒绝，而不是夹成空操作
  const before = f.read()
  assert.throws(() => f.call('trpg_apply', { actor: 'pc', heal: 20, reason: '满血时使用治疗' }), /超出当前缺口/)
  assert.throws(() => f.call('trpg_apply', { actor: 'pc', hp: 20, reason: '满血时传正增量' }), /超出当前缺口/)
  assert.deepEqual(f.read(), before, '被拒的治疗不得写档')
  // 复现真实误用：当前 120 传 hp:132 想把 HP 变成 132 —— 必须报错并指出写法问题
  assert.throws(() => f.call('trpg_apply', { actor: 'pc', hp: 132, reason: '误把绝对目标值当增量' }), /绝对目标值/)
  assert.equal(f.read().characters.pc.state.hp, f.maxHp, '误用不得改动 HP')
  // 缺口内的正常治疗仍然通过
  f.call('trpg_apply', { actor: 'pc', damage: 30, reason: '受伤' })
  const hurt = f.read().characters.pc.state.hp
  const ok = f.call('trpg_apply', { actor: 'pc', heal: 10, reason: '包扎' })
  assert.equal(f.read().characters.pc.state.hp, hurt + 10)
  assert.match(ok.publicSummary, new RegExp(`HP ${hurt}→${hurt + 10}`))
})

test('伤害可把角色打到重伤，且不死亡', t => {
  const f = fixture(t)
  const out = f.call('trpg_apply', { actor: 'pc', damage: f.maxHp, reason: '被大幅削弱的伤害压垮' })
  const s = f.read()
  assert.equal(s.characters.pc.state.hp, 0)
  assert.ok(s.characters.pc.state.status.includes('重伤'))
  assert.equal(out.downed, true)
})

test('apply 的伤害跨实例读档保留，且同 requestId 重放不重复扣血', t => {
  const f = fixture(t)
  const args = { actor: 'pc', damage: 12, reason: '落石擦伤' }
  f.r.execute({ tool: 'trpg_apply', mode: 'solo', slot: 'case', requestId: 'apply_damage_1', input: args })
  const once = f.read().characters.pc.state.hp
  assert.equal(once, f.maxHp - 12)
  const journal = new Journal(f.root, 'solo', 'case')
  // 模拟重试：新实例、同一 requestId、且改成等价的 hp 写法，仍须命中幂等回放
  const retry = new Runtime({ root: f.root }).execute({ tool: 'trpg_apply', mode: 'solo', slot: 'case', requestId: 'apply_damage_1', input: { actor: 'pc', hp: -12, reason: '落石擦伤' } })
  assert.equal(retry.replayed, true, '等价 HP 写法重试必须命中幂等回放')
  assert.equal(new Runtime({ root: f.root }).execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'load' } }).state.characters.pc.state.hp, once)
  assert.equal(journal.verify().events, 2)
})

test('战斗中不得用 apply 绕过攻击流程扣血', t => {
  const f = fixture(t)
  f.call('trpg_scene', { op: 'open', goal: '战斗中的场外扣血', location: '石桥' })
  f.call('trpg_combat', { op: 'start', enemies: [{ id: 'e', template: '盗宝团斥候' }] })
  const before = f.read()
  assert.throws(() => f.call('trpg_apply', { actor: 'pc', damage: 30, reason: '想跳过回合' }), /战斗中/)
  assert.deepEqual(f.read(), before)
})
