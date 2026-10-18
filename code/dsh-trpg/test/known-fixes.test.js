import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { Journal } from '../engine/journal.js'
import { resolveDamage } from '../engine/damage.js'
import { createTools } from '../lib/tools.js'
import { playerCheck } from '../lib/player-check.js'

function fixture(t, d6Source = () => 4) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-known-fixes-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const runtime = new Runtime({ root, d6Source, random: () => 0 })
  let n = 0
  const call = (tool, input, extra = {}) => runtime.execute({ tool, input, mode: 'solo', slot: 'case', requestId: `k_${++n}`, ...extra })
  const read = () => call('trpg_save', { op: 'load' }).state
  call('trpg_save', { op: 'new' })
  call('trpg_char', { op: 'create', id: 'pc', name: '顾行探针', attributes: { 体魄: 2, 灵巧: 1, 心智: 0, 感知: 1, 交涉: 0, 意志: -1 }, powerType: 'mundane' })
  const open = () => call('trpg_scene', { op: 'open', goal: '保护货物并撤离', location: '石桥' })
  const battle = (template = '盗宝团斥候') => { open(); return call('trpg_combat', { op: 'start', enemies: [{ id: 'e', template }] }) }
  return { root, runtime, call, read, open, battle }
}
const transfer = { op: 'transfer', item: 'p', quantity: 1, recipient: '采石场持撬棍者', reason: '已同意以药剂换借车', sourceId: 'cart_trade' }

test('物品转交扣真实库存且不治疗，同请求回放、同来源不重扣，跨实例保留', t => {
  const f = fixture(t)
  f.call('trpg_item', { op: 'buy', type: '药剂', id: 'p' })
  const before = f.read()
  const first = f.call('trpg_item', transfer, { requestId: 'transfer_once' })
  assert.equal(first.remaining, 1)
  assert.match(first.publicSummary, /已交给采石场持撬棍者.*库存剩余1/)
  assert.deepEqual(first.state.characters.pc.state, before.characters.pc.state)
  assert.equal(f.call('trpg_item', transfer, { requestId: 'transfer_once' }).replayed, true)
  assert.throws(() => f.call('trpg_item', transfer), /已结算/)
  assert.equal(new Runtime({ root: f.root }).execute({ tool: 'trpg_item', mode: 'solo', slot: 'case', input: { op: 'list' } }).inventory.p.quantity, 1)
})

test('非法转交、超量及陈旧版本不写档；战斗中不得用场外转交绕过行动', t => {
  const f = fixture(t)
  f.call('trpg_item', { op: 'buy', type: '药剂', id: 'p' })
  for (const patch of [{ quantity: 0 }, { quantity: -1 }, { quantity: 0.5 }, { quantity: 3 }, { recipient: '' }, { recipient: 'pc' }, { sourceId: '' }, { item: 'absent' }]) {
    const before = f.read()
    assert.throws(() => f.call('trpg_item', { ...transfer, ...patch }))
    assert.deepEqual(f.read(), before)
  }
  assert.throws(() => f.call('trpg_item', transfer, { expectedRevision: 1 }), /版本|更新/)
  f.battle()
  const before = f.read()
  assert.throws(() => f.call('trpg_item', transfer), /战斗中/)
  assert.deepEqual(f.read(), before)
})

test('独行杂兵不再被单手剑代价攻击一击清空，也能伤到体魄2的普通护送人', t => {
  const f = fixture(t, () => 3)
  f.battle()
  assert.deepEqual([f.read().battle.enemies[0].max_hp, f.read().battle.enemies[0].single], [20, 12])
  const attack = f.call('trpg_combat_attack', { actor: 'pc', target: 'e' })
  assert.equal(attack.check.tier, 'success_cost')
  assert.equal(attack.damage.final, 12)
  assert.equal(attack.hp, 8)
  const enemy = new Runtime({ root: f.root, d6Source: () => 6, random: () => 0 }).execute({ tool: 'trpg_combat', mode: 'solo', slot: 'case', input: { op: 'enemy' }, requestId: 'enemy_hit' })
  assert.equal(enemy.events[0].damage, 3) // 80%减伤上限：floor(12*0.8)=9
  assert.equal(f.read().characters.pc.state.hp, 147)
  assert.match(attack.publicSummary, /3 \+ 3.*成功，但有代价/)
  assert.match(attack.publicSummary, /造成12伤害.*HP 8/)
  assert.match(enemy.publicSummary, /命中.*3伤害.*HP 147/)
})

test('减伤上限双方对称，负减伤仍增伤，未命中不触发最低伤害或反应', () => {
  const capped = resolveDamage({ weaponDamage: 12, targetReduction: 100, tier: 'success' })
  assert.equal(capped.final, 3)
  assert.equal(capped.reduction, 9)
  assert.equal(capped.requestedReduction, 100)
  assert.equal(resolveDamage({ weaponDamage: 12, targetReduction: -10, tier: 'success' }).final, 22)
  const miss = resolveDamage({ weaponDamage: 12, targetReduction: 100, tier: 'failure', attackerElement: '火', attachedElement: '水' })
  assert.equal(miss.final, 0)
  assert.equal(miss.reaction, null)
})

test('新独行首领保留65HP但不再把伤害折扣成10，同伴参战不作独行缩放', t => {
  const f = fixture(t)
  f.battle('急冻树')
  assert.deepEqual([f.read().battle.enemies[0].max_hp, f.read().battle.enemies[0].aoe, f.read().battle.enemies[0].single], [65, 18, 20])
})

test('撤退代价成功按事前声明扣补给，完整成功和失败不收这笔额外代价', t => {
  for (const [faces, expectedTier, expectedSupplies, over] of [[[3, 3], 'success_cost', 2, true], [[5, 5], 'success', 3, true], [[1, 2], 'failure', 3, false]]) {
    let i = 0
    const f = fixture(t, () => faces[i++ % 2])
    f.battle()
    const out = f.call('trpg_combat_attack', { actor: 'pc', action: 'retreat', retreatCost: { type: 'supplies', quantity: 1, reason: '仓促撤离遗落一份补给' } })
    assert.equal(out.check.tier, expectedTier)
    assert.equal(out.state.supplies, expectedSupplies)
    assert.equal(out.state.battle.over, over)
    assert.equal(Boolean(out.paidCost), expectedTier === 'success_cost')
  }
})

test('撤退先验证代价，缺项不掷骰；无补给仍可用事前说明的位置损失撤离', t => {
  let rolled = 0
  const f = fixture(t, () => { rolled++; return 3 })
  f.battle()
  const before = f.read()
  assert.throws(() => f.call('trpg_combat_attack', { actor: 'pc', action: 'retreat' }), /事前声明retreatCost/)
  assert.equal(rolled, 0)
  assert.deepEqual(f.read(), before)
  const out = f.call('trpg_combat_attack', { actor: 'pc', action: 'retreat', retreatCost: { type: 'position', reason: '为甩开追击放弃近路，被迫绕回远处林道，无法继续监视桥头' } })
  assert.equal(out.outcome, 'retreated')
  assert.match(out.state.world.known_facts.at(-1), /无法继续监视桥头/)
})

test('撤退物品代价只扣指定数量且不会治疗', t => {
  const f = fixture(t, () => 3)
  f.call('trpg_item', { op: 'buy', type: '药剂', id: 'p' })
  f.battle()
  const out = f.call('trpg_combat_attack', { actor: 'pc', action: 'retreat', retreatCost: { type: 'item', item: 'p', quantity: 1, reason: '为腾手攀坡遗落一瓶药剂' } })
  assert.equal(out.state.inventory.p.quantity, 1)
  assert.equal(out.state.characters.pc.state.hp, 150)
})

test('有过夜硬时限的事项在跨日即时提示，过期关闭须记录后果，旧无期限事项兼容', t => {
  const f = fixture(t)
  f.call('trpg_state', { op: 'addThread', id: 'herbs', text: '运回草药', deadlineDay: 1, deadlineConsequence: '闷过一夜会损坏，须查验品质' })
  f.call('trpg_state', { op: 'addThread', id: 'old', text: '无时限旧任务' })
  assert.throws(() => f.call('trpg_state', { op: 'addThread', id: 'invalid', text: '缺少后果', deadlineDay: 1 }))
  const rest = f.call('trpg_recover', { level: '休整', reason: '选择在城内过夜' })
  assert.equal(rest.warnings.filter(w => w.kind === 'thread_deadline_passed').length, 1)
  assert.match(rest.warnings.find(w => w.kind === 'thread_deadline_passed').text, /查验品质/)
  assert.throws(() => f.call('trpg_state', { op: 'closeThread', id: 'herbs' }), /已过时限/)
  f.call('trpg_state', { op: 'closeThread', id: 'herbs', resolution: '实际验货有两箱受潮，只按剩余可用药材结算' })
  f.call('trpg_state', { op: 'closeThread', id: 'old' })
  assert.equal(f.read().world.threads[0].deadlineResolution, '实际验货有两箱受潮，只按剩余可用药材结算')
})

test('误用攻击入口执行敌方行动时直接给正确入口，不弹玩家卡也不写档', async t => {
  const f = fixture(t)
  f.battle()
  let asked = 0
  const tool = createTools({ root: f.root, askPlayer: async () => { asked++; throw new Error('不应弹卡') } }).find(t => t.name === 'trpg_combat_attack')
  const before = new Journal(f.root, 'solo', 'case').verify()
  assert.throws(() => tool.execute({ mode: 'solo', slot: 'case', input: { op: 'enemy' } }, {}), /敌方回合请用trpg_combat/)
  assert.equal(asked, 0)
  assert.deepEqual(new Journal(f.root, 'solo', 'case').verify(), before)
})

test('玩家撤退卡先公开额外代价，等待无扣款，手动提交与重试只支付一次', async t => {
  const f = fixture(t)
  f.battle()
  let answer, asks = 0, question
  const tool = createTools({ root: f.root, askPlayer: request => { question = request.questions[0]; asks++; return new Promise(resolve => { answer = resolve }) } }).find(t => t.name === 'trpg_combat_attack')
  const args = { mode: 'solo', slot: 'case', requestId: 'retreat_player_once', input: { actor: 'pc', action: 'retreat', retreatCost: { type: 'supplies', quantity: 1, reason: '仓促脱离遗落一份补给' } } }
  const before = f.read()
  const pending = tool.execute(args, {})
  assert.deepEqual(f.read(), before)
  assert.match(question.question, /仅代价成功时额外支付.*遗落一份补给/)
  answer({ answers: [{ id: args.requestId, custom: '3,3', selected: [] }] })
  const out = await pending
  assert.equal(out.state.supplies, 2)
  assert.equal((await tool.execute(args, {})).replayed, true)
  assert.equal(asks, 1)
  assert.equal(f.read().supplies, 2)
})

test('直接玩家检定入口也标准化字符串input，重复提交回放而不再问骰', async t => {
  const f = fixture(t)
  f.open()
  let asks = 0
  const ask = async request => { asks++; return { answers: [{ id: request.questions[0].id, custom: '4,3', selected: [] }] } }
  const args = { mode: 'solo', slot: 'case', requestId: 'direct_string', input: JSON.stringify({ actor: 'pc', attribute: '感知', purpose: '辨认脚印', waitForPlayer: true }) }
  const first = await playerCheck(f.runtime, args, {}, ask, { root: f.root })
  assert.equal(first.check.total, 8)
  assert.equal((await playerCheck(f.runtime, args, {}, ask, { root: f.root })).replayed, true)
  assert.equal(asks, 1)
})
