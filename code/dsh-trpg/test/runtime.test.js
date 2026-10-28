import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Runtime } from '../engine/runtime.js'
import { Journal } from '../engine/journal.js'
import { createTools } from '../lib/tools.js'
import { BUILD_SCHEMES, validateBuild } from '../engine/rules.js'
import { makeArtifact } from '../engine/gear.js'

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trpg-test-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const r = new Runtime({ root, d6Source: () => 4, random: () => 0, ...options })
  let sequence = 0
  const call = (tool, input = {}, extra = {}) => r.execute({ mode: 'solo', slot: 'case', tool, input, requestId: `test_${++sequence}`, ...extra })
  const read = () => call('trpg_save', { op: 'load' }).state
  call('trpg_save', { op: 'demo' })
  return { root, r, call, read }
}
function open(f) { f.call('trpg_scene', { op: 'open', goal: '找回货箱', location: '车道' }) }

test('已发生跨日可记录且不治疗，休整加日后同日同步不重复恢复', t => {
  const f = fixture(t)
  f.call('trpg_apply', { actor: 'pc', hp: -20, reason: '受伤' })
  const before = f.read()
  assert.equal(before.characters.pc.state.hp, before.characters.pc.state.max_hp - 20)
  f.call('trpg_state', { op: 'set', day: 3, reason: '已完成两日行程，补记日期' })
  const after = f.read()
  assert.equal(after.world.day, 3)
  assert.deepEqual(after.characters, before.characters)
  assert.equal(after.supplies, before.supplies)
  assert.deepEqual(after.inventory, before.inventory)
  f.call('trpg_recover', { level: '休整', reason: '安全住所休息一夜' })
  const rested = f.read()
  assert.equal(rested.world.day, 4)
  f.call('trpg_state', { op: 'set', day: 4, reason: '核对休整后的同一日，不再增加' })
  assert.deepEqual(f.read().characters, rested.characters)
  assert.equal(f.read().world.day, 4)
})

test('日期倒退、非法日期及set未知字段失败且不提交部分状态', t => {
  const f = fixture(t)
  f.call('trpg_state', { op: 'set', day: 3, reason: '两日行程结束' })
  for (const patch of [{ day: 2 }, { day: 0 }, { day: 3.5 }, { day: '4' }, { day: 100001 }, { daay: 4 }, { samples: ['粉末'] }, { day: 4, safe: 'yes' }]) {
    const before = f.call('trpg_save', { op: 'load' })
    assert.throws(() => f.call('trpg_state', { op: 'set', location: '不应落盘', ...patch, reason: '无效调用' }))
    assert.deepEqual(f.call('trpg_save', { op: 'load' }), before)
  }
})
test('正式开场无需存档，普通角色不默认获得元素，旅行者能力独立', (t) => {
  const f = fixture(t)
  const call = (tool, input) => f.r.execute({ mode: 'solo', slot: 'opening', tool, input })
  assert.match(call('trpg_char', { op: 'opening' }).opening, /还没有接受任何委托/)
  call('trpg_save', { op: 'new' })
  let s = call('trpg_char', { op: 'create', id: 'pc', background: '蒙德的草药采集者' }).state
  assert.equal(s.characters.pc.vision, false)
  assert.equal(s.characters.pc.element, null)
  assert.equal(s.characters.traveler, undefined)
  call('trpg_party', { op: 'traveler', action: 'meet', reason: '现场初识' })
  s = call('trpg_party', { op: 'traveler', action: 'join', playerConfirmed: true, reason: '双方同意同行' }).state
  assert.equal(s.characters.traveler.element, '风')
  assert.equal(s.characters.traveler.power.type, 'traveler')
  call('trpg_scene', { op: 'open', goal: '试验战斗' })
  call('trpg_combat', { op: 'start', enemies: [{ name: '丘丘人' }] })
  const before = call('trpg_save', { op: 'load' }).state
  assert.throws(() => call('trpg_combat', { op: 'act', actor: 'pc', action: 'skill', target: before.battle.enemies[0].id }), /没有已确认的元素能力/)
  assert.deepEqual(call('trpg_save', { op: 'load' }).state, before)
})

test('自定义能力待审核不能掷骰；确认后仅允许既有叙事检定，不凭空赋予元素', (t) => {
  const f = fixture(t)
  const call = (tool, input) => f.r.execute({ mode: 'solo', slot: 'custom', tool, input })
  call('trpg_save', { op: 'new' })
  call('trpg_char', { op: 'create', id: 'pc', powerType: 'custom', ability: { source: '师承的炼金训练', effect: '辨认药材', limits: '需要接触样本', cost: '需要观察时间' } })
  call('trpg_scene', { op: 'open', goal: '辨认药材' })
  const before = call('trpg_save', { op: 'load' }).state
  assert.throws(() => call('trpg_check', { actor: 'pc', attribute: '心智' }), /待设定审核/)
  assert.deepEqual(call('trpg_save', { op: 'load' }).state, before)
  call('trpg_scene', { op: 'close' })
  assert.throws(() => call('trpg_char', { op: 'approvePower', id: 'pc', mechanic: 'narrative', reason: '仅辨认普通药材' }), /玩家/)
  call('trpg_char', { op: 'approvePower', id: 'pc', mechanic: 'narrative', playerConfirmed: true, reason: '仅辨认普通药材，用心智检定，不产生额外加值' })
  call('trpg_scene', { op: 'open', goal: '辨认药材' })
  assert.ok(call('trpg_check', { actor: 'pc', attribute: '心智' }).check)
  assert.equal(call('trpg_save', { op: 'load' }).state.characters.pc.element, null)
})

test('建卡拒绝矛盾神之眼、未知元素和缺少代价的自定义能力，失败不写状态', (t) => {
  const f = fixture(t)
  const call = (input) => f.r.execute({ mode: 'solo', slot: 'invalid', tool: 'trpg_char', input: { op: 'create', id: 'pc', ...input } })
  f.r.execute({ mode: 'solo', slot: 'invalid', tool: 'trpg_save', input: { op: 'new' } })
  assert.throws(() => call({ powerType: 'mundane', element: '火' }), /不能直接指定元素/)
  assert.throws(() => call({ powerType: 'vision', element: '时间' }), /一种神之眼元素/)
  assert.throws(() => call({ powerType: 'vision', vision: false, element: '冰' }), /冲突/)
  assert.throws(() => call({ powerType: 'custom', ability: {} }), /特殊能力来源/)
  const state = f.r.execute({ mode: 'solo', slot: 'invalid', tool: 'trpg_save', input: { op: 'load' } }).state
  assert.deepEqual(state.characters, {})
  assert.equal(state.revision, 1)
})
function next(f) {
  const s = f.read(), b = s.battle, t = b.order[b.cursor]
  if (b.over) return b
  if (!t) f.call('trpg_combat', { op: 'advance' })
  else if (t.side === 'enemy') f.call('trpg_combat', { op: 'enemy' })
  else f.call('trpg_combat', { op: 'act', actor: t.id, action: 'attack', target: b.enemies.find((e) => e.hp > 0).id })
  return f.read().battle
}

test('三种建卡方案均符合 +3 预算，单人旅行者自动同步', (t) => {
  const f = fixture(t)
  for (const a of Object.values(BUILD_SCHEMES)) { assert.equal(Object.values(a).reduce((a, b) => a + b), 3); assert(validateBuild(a).ok) }
  const s = f.read()
  assert.equal(s.characters.pc.state.max_hp, 120)
  assert.equal(s.characters.traveler.state.max_hp, 95)
  assert.equal(s.characters.traveler.derived.damage, 20)
  assert.throws(() => f.call('trpg_char', { op: 'create', id: 'another' }), /玩家位已满/)
})

test('幂等请求重放原结果，不重复扣资源；同 id 换内容被拒', (t) => {
  const f = fixture(t)
  const first = f.call('trpg_item', { op: 'buy', type: '料理' }, { requestId: 'buy_once' })
  const retry = f.call('trpg_item', { op: 'buy', type: '料理' }, { requestId: 'buy_once' })
  assert.equal(first.revision, retry.revision)
  assert.equal(retry.replayed, true)
  assert.equal(f.read().supplies, 2)
  assert.throws(() => f.call('trpg_item', { op: 'buy', type: '药剂' }, { requestId: 'buy_once' }), /不同操作/)
})

test('拒绝覆盖、过期修订和越界槽位；两模式与两个槽位互不污染', (t) => {
  const f = fixture(t)
  assert.throws(() => f.call('trpg_save', { op: 'demo' }), /已存在/)
  assert.throws(() => f.call('trpg_narrate', { text: '旧页面' }, { expectedRevision: 0 }), /状态已更新/)
  for (const slot of ['../escape', '..\\escape', 'CON', '__proto__', 'constructor', '']) assert.throws(() => f.call('trpg_save', { op: 'new' }, { slot }))
  f.call('trpg_save', { op: 'new' }, { mode: 'multi', slot: 'case' })
  f.call('trpg_save', { op: 'new' }, { slot: 'other' })
  assert.equal(f.read().mode, 'solo')
  assert.equal(Object.keys(f.read().characters).length, 2)
  assert.equal(f.call('trpg_save', { op: 'load' }, { mode: 'multi' }).state.supplies, 3)
})

test('重启从完整事件恢复；丢弃/篡改快照不影响事实，损坏日志拒绝读取', (t) => {
  const f = fixture(t); open(f)
  f.call('trpg_scene', { op: 'check', actor: 'pc', attribute: '灵巧' })
  const before = f.read()
  fs.writeFileSync(path.join(f.root, 'save/slots/solo/case/state.json'), '{}')
  const restarted = new Runtime({ root: f.root })
  assert.deepEqual(restarted.execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'load' } }).state, before)
  const file = path.join(f.root, 'save/slots/solo/case/journal.jsonl')
  fs.appendFileSync(file, '{bad')
  assert.throws(() => f.read(), /不完整/)
})

test('事务失败不写事件、不留锁、不损失补给', (t) => {
  const f = fixture(t), before = f.read()
  assert.throws(() => f.call('trpg_item', { op: 'grant', sourceId: 'bad_grant', reason: '测试', items: [{ id: 'bad', type: '未知' }] }))
  assert.deepEqual(f.read(), before)
  assert(!fs.existsSync(path.join(f.root, 'save/slots/solo/case/.transaction.lock')))
})

test('场景跨进程保留检定；第4次被拒，关场实际恢复且不可重复', (t) => {
  const f = fixture(t)
  f.call('trpg_apply', { actor: 'pc', hp: -40, energy: -2, reason: '旅途消耗' })
  open(f)
  const baseline = f.call('trpg_scene', { op: 'check', actor: 'pc', attribute: '交涉' }).check.total
  const helper = f.call('trpg_scene', { op: 'check', actor: 'pc', attribute: '交涉', helpers: ['traveler'] }).check.total
  assert.equal(helper, baseline + 1)
  f.call('trpg_check', { actor: 'pc', attribute: '交涉' })
  assert.throws(() => f.call('trpg_check', { actor: 'pc' }), /最多三次/)
  assert.equal(new Runtime({ root: f.root }).execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'load' } }).state.scene.checks.length, 3)
  const result = f.call('trpg_scene', { op: 'close' })
  assert.equal(result.checkCount, 3)
  assert.equal(result.state.characters.pc.state.hp, 92)
  assert.equal(result.state.characters.pc.state.elemental_energy, 3)
  assert.throws(() => f.call('trpg_scene', { op: 'close' }))
})

test('空场景不能刷恢复，未知角色/标签/虚构协助被拒', (t) => {
  const f = fixture(t)
  f.call('trpg_apply', { actor: 'pc', hp: -20, reason: '测试伤势' }); open(f)
  assert.throws(() => f.call('trpg_check', { actor: 'missing' }))
  assert.throws(() => f.call('trpg_check', { actor: 'pc', tag: '虚构标签' }))
  assert.throws(() => f.call('trpg_check', { actor: 'pc', helpers: ['traveler', 'traveler'] }))
  const close = f.call('trpg_scene', { op: 'close' })
  assert.equal(close.energyRestored, false)
  assert.equal(close.state.characters.pc.state.hp, 100)
})

test('攻击按角色卡与存档扣血/扣能量，不能自填档位或跳轮', (t) => {
  const f = fixture(t); open(f)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '丘丘暴徒', id: 'e' }] })
  assert.throws(() => f.call('trpg_combat', { op: 'advance' }), /未行动/)
  assert.throws(() => f.call('trpg_combat', { op: 'act', actor: 'traveler', target: 'e' }), /当前行动者/)
  assert.throws(() => f.call('trpg_combat_attack', { actor: 'pc', target: 'e', tier: 'critical_success' }), /不接受/)
  const before = f.read(), hit = f.call('trpg_combat_attack', { actor: 'pc', target: 'e', action: 'skill' })
  assert.equal(hit.state.characters.pc.state.elemental_energy, 2)
  assert.equal(hit.state.battle.enemies[0].hp, before.battle.enemies[0].hp - hit.damage.final)
  assert.equal(hit.state.battle.enemies[0].attached_element, '水')
  assert.throws(() => f.call('trpg_combat_attack', { actor: 'pc', target: 'e' }), /当前行动者/)
})

test('战斗胜利与轮次均持久化，持续防御会在第4轮结束', (t) => {
  const f = fixture(t, { d6Source: () => 3 }); open(f)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '急冻树', id: 'e' }] })
  for (let i = 0; i < 40 && !f.read().battle.over; i++) {
    const b = f.read().battle, t = b.order[b.cursor]
    if (!t) f.call('trpg_combat_advance', {})
    else if (t.side === 'enemy') f.call('trpg_combat', { op: 'enemy' })
    else f.call('trpg_combat', { op: 'act', actor: t.id, action: 'defend' })
  }
  const end = f.read().battle
  assert.equal(end.outcome, 'stalemate'); assert.equal(end.roundsCompleted, 4)
  assert.equal(new Journal(f.root, 'solo', 'case').load().battle.outcome, 'stalemate')
})

test('装备强化真实消耗材料与补给，刷新 HP 并动态跟随旅行者', (t) => {
  const f = fixture(t)
  const equipped = f.call('trpg_gear', { op: 'equip', actor: 'pc', item: 'flower' }).state
  assert.equal(equipped.characters.pc.state.max_hp, 130)
  assert.equal(equipped.characters.pc.state.hp, 120, '穿戴不白送治疗')
  assert.equal(equipped.characters.traveler.state.max_hp, 100)
  const upgraded = f.call('trpg_gear', { op: 'upgrade', actor: 'pc', slot: '生之花', material: 'material' }).state
  assert.equal(upgraded.supplies, 2); assert.equal(upgraded.inventory.material.quantity, 0)
  assert.equal(upgraded.characters.pc.state.max_hp, 135)
  assert.equal(upgraded.characters.traveler.state.max_hp, 105)
  assert.throws(() => f.call('trpg_gear', { op: 'upgrade', actor: 'pc', slot: '生之花', material: 'material' }))
})

test('料理药剂共用次数，库存不会负数；失败动作保持版本', (t) => {
  const f = fixture(t); open(f)
  f.call('trpg_item', { op: 'use', actor: 'pc', item: 'food' })
  assert.equal(f.read().inventory.food.quantity, 1)
  const revision = f.read().revision
  assert.throws(() => f.call('trpg_item', { op: 'use', actor: 'pc', item: 'food' }), /已使用/)
  assert.equal(f.read().revision, revision)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '丘丘暴徒' }] })
  assert.throws(() => f.call('trpg_item', { op: 'use', actor: 'pc', item: 'potion' }), /已使用/)
})

test('奖励来源只结算一次，高星物品门槛不能由 hasMaterial 布尔值伪造', (t) => {
  const f = fixture(t)
  f.call('trpg_item', { op: 'reward', sourceId: 'quest_a', reason: '完成委托' })
  assert.equal(f.read().supplies, 4)
  assert.throws(() => f.call('trpg_item', { op: 'reward', sourceId: 'quest_a', reason: '重复提交' }))
  assert.throws(() => f.call('trpg_item', { op: 'grant', sourceId: 'high', reason: '测试', items: [{ id: 'high', type: '圣遗物', set: '冒险家', slot: '生之花', quality: 5 }] }), /四星以上/)
})

test('休息需安全，扎营扣补给回能但保留重伤', (t) => {
  const f = fixture(t); open(f)
  assert.throws(() => f.call('trpg_recover', { level: '扎营' }), /安全/)
  f.call('trpg_state', { op: 'set', safe: true, reason: '营地已清理' })
  f.call('trpg_apply', { actor: 'pc', hp: -120, energy: -3, reason: '剧情伤势' })
  const result = f.call('trpg_recover', { level: '扎营' }).state
  assert.equal(result.supplies, 2)
  assert.equal(result.characters.pc.state.elemental_energy, 3)
  assert(result.characters.pc.state.status.includes('重伤'))
})

test('神像次数与关场恢复不叠加，跨站传送被拒', (t) => {
  const f = fixture(t)
  f.call('trpg_scene', { op: 'open', goal: '抵达神像', location: '神像前', safe: true })
  f.call('trpg_state', { op: 'anchor', id: 'statue', name: '风神像', kind: '神像' })
  f.call('trpg_apply', { actor: 'pc', hp: -40, reason: '测试伤势' })
  f.call('trpg_recover', { level: '神像', anchor: 'statue' })
  assert.equal(f.read().characters.pc.state.hp, 92)
  assert.throws(() => f.call('trpg_recover', { level: '神像', anchor: 'statue' }))
  f.call('trpg_scene', { op: 'close' })
  assert.equal(f.read().characters.pc.state.hp, 92)
  f.call('trpg_state', { op: 'nextStation', reason: '蒙德篇章已完成' })
  assert.throws(() => f.call('trpg_state', { op: 'teleport', from: 'statue', to: 'statue' }))
})

test('四阶关系单步升级，背叛暂停支援；关系不提升剧透权限', (t) => {
  const f = fixture(t); open(f)
  for (let i = 0; i < 2; i++) f.call('trpg_relation', { op: 'raise', actor: 'pc', npc: 'amber', sourceId: `relation_${i}`, reason: '关键协作事件' })
  assert.equal(f.read().characters.pc.relations.amber, '信任')
  f.call('trpg_party', { op: 'support', actor: 'pc', npc: 'amber', name: '安柏', reason: '恰逢巡逻，可以协助侦察' })
  f.call('trpg_relation', { op: 'betray', actor: 'pc', npc: 'amber', sourceId: 'betray', reason: '泄露重要秘密' })
  assert.throws(() => f.call('trpg_party', { op: 'support', actor: 'pc', npc: 'amber', name: '安柏', reason: '再邀请' }))
  assert.throws(() => f.call('trpg_lore', { query: '钟离', spoilerMax: '隐藏' }))
})

test('party support允许已建立信任关系的新互动NPC，仍拒绝关系不足或同场重复登记', (t) => {
  const f = fixture(t); open(f)
  for (let i = 0; i < 2; i++) f.call('trpg_relation', { op: 'raise', actor: 'pc', npc: 'mona', sourceId: `mona_relation_${i}`, reason: '共同调查并互相帮助' })
  const result = f.call('trpg_party', { op: 'support', actor: 'pc', npc: 'mona', name: '莫娜', reason: '她已在场，答应用占星结果协助判断敌人动向' })
  assert.deepEqual(result.support, { id: 'mona', name: '莫娜', reason: '她已在场，答应用占星结果协助判断敌人动向' })
  assert.throws(() => f.call('trpg_party', { op: 'support', actor: 'pc', npc: 'charlotte', name: '夏洛蒂', reason: '在场协助' }), /达到信任或羁绊/)
  for (let i = 0; i < 2; i++) f.call('trpg_relation', { op: 'raise', actor: 'pc', npc: 'charlotte', sourceId: `charlotte_relation_${i}`, reason: '建立信任' })
  assert.throws(() => f.call('trpg_party', { op: 'support', actor: 'pc', npc: 'charlotte', name: '夏洛蒂', reason: '想更换支援者' }), /每场只能一名 NPC 支援/)
})

test('剧情索引逐阶段解锁，禁止内容/任意路径/未来站点不返回正文', (t) => {
  const f = fixture(t)
  for (const query of ['哥伦比娅', '水龙王', '钟离', '世界树真相']) assert.deepEqual(f.call('trpg_lore', { query }).hits, [])
  assert.throws(() => f.call('trpg_lore', { query: 'a', file: '../MEMORY.md' }))
  assert(f.call('trpg_lore', { query: '安柏' }).hits.length)
  assert.equal(f.call('trpg_lore', { query: '货箱' }).hits.length, 0)
  open(f); f.call('trpg_scene', { op: 'check', actor: 'pc', attribute: '灵巧', unlockFlag: 'road_clue' })
  assert.equal(f.call('trpg_lore', { query: '货箱' }).hits.length, 1)
  assert.equal(f.call('trpg_lore', { query: '货箱', spoilerMax: '公开' }).hits.length, 0)
})

test('多人工具路由不依赖全局活动档，未满3人不能开正式多人战', (t) => {
  const f = fixture(t)
  const call = (tool, input) => f.call(tool, input, { mode: 'multi', slot: 'friends' })
  call('trpg_save', { op: 'new' })
  call('trpg_char', { op: 'create', id: 'a' })
  call('trpg_scene', { op: 'open', goal: '多人测试' })
  assert.throws(() => call('trpg_combat', { op: 'start', enemies: [{ name: '丘丘人' }] }))
  call('trpg_char', { op: 'create', id: 'b', scheme: '专精' })
  call('trpg_char', { op: 'create', id: 'c', scheme: '通才' })
  const result = call('trpg_combat', { op: 'start', enemies: [{ name: '急冻树' }] })
  assert.equal(result.state.battle.enemies[0].max_hp, 210)
  assert(!result.state.characters.traveler)
  assert.equal(f.read().mode, 'solo')
})

test('注册工具与运行时共用入口，关闭场景不是临时对象', (t) => {
  const f = fixture(t), tools = createTools({ root: f.root, d6Source: () => 4 })
  const invoke = (name, input) => tools.find((tool) => tool.name === name).execute({ mode: 'solo', slot: 'case', input })
  assert.equal(tools.length, 19)
  invoke('trpg_scene', { op: 'open', goal: '工具链验收' })
  invoke('trpg_check', { actor: 'pc', attribute: '灵巧' })
  const close = invoke('trpg_scene', { op: 'close' })
  assert.equal(close.checkCount, 1)
  assert.equal(close.state.scene.closed, true)
})

function setup(f, mutate) {
  return new Journal(f.root, 'solo', 'case').commit('fixture', {}, (s) => { mutate(s); return { state: s, result: {} } })
}
test('冻结只取消首领下一次攻击，不跳过整轮两个攻击', (t) => {
  const f = fixture(t); open(f)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '急冻树', id: 'e' }] })
  setup(f, (s) => { s.battle.enemies[0].attached_element = '冰' })
  const hit = f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'skill', target: 'e' })
  assert.equal(hit.damage.reaction, '冻结')
  const response = f.call('trpg_combat', { op: 'enemy' })
  assert.equal(response.events[0].skipped, '冻结')
  assert.equal(response.events[1].kind, 'single')
  assert.equal(response.events[1].damage, 20)
  assert.equal(f.read().battle.enemies[0].runtime.frozen, false)
})

test('燃烧在两个轮末扣血且不凭空增加独立行动', (t) => {
  const f = fixture(t); open(f)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '急冻树', id: 'e' }] })
  setup(f, (s) => { s.characters.pc.element = '火'; s.battle.enemies[0].attached_element = '草' })
  const hit = f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'skill', target: 'e' })
  assert.equal(hit.damage.reaction, '燃烧')
  for (let i = 0; i < 20 && f.read().battle.tick < 3; i++) {
    const b = f.read().battle, turn = b.order[b.cursor]
    if (!turn) f.call('trpg_combat', { op: 'advance' })
    else if (turn.side === 'enemy') f.call('trpg_combat', { op: 'enemy' })
    else f.call('trpg_combat', { op: 'act', actor: turn.id, action: 'defend' })
  }
  assert.equal(f.read().battle.enemies[0].hp, hit.hp - 20)
  assert.equal(f.read().battle.enemies[0].effects[0].turns, 0)
})

test('结晶护盾归攻击者，敌人命中目标值 +1 后受击消耗', (t) => {
  const f = fixture(t); open(f)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '急冻树', id: 'e' }] })
  setup(f, (s) => { s.characters.pc.element = '岩'; s.battle.enemies[0].attached_element = '火' })
  const hit = f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'skill', target: 'e' })
  assert.equal(hit.state.characters.pc.crystal, true)
  assert(!hit.state.battle.enemies[0].status.includes('结晶护盾'))
  const enemy = f.call('trpg_combat', { op: 'enemy' })
  assert.equal(enemy.events[0].roll.targetNumber, 8)
  assert.equal(enemy.state.characters.pc.crystal, false)
})

test('护甲主机制真实拆除，不能把一次互动当重复伤害', (t) => {
  const f = fixture(t); open(f)
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '愚人众先遣队', id: 'e' }] })
  assert.equal(f.read().battle.enemies[0].reduction, 10)
  const response = f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'interact', target: 'e' })
  assert(response.cleared)
  assert.equal(response.state.battle.enemies[0].reduction, 0)
  assert.equal(response.state.battle.enemies[0].hp, 40)
})

test('旧请求重试返回原动作结果与最新状态，不倒退页面版本', (t) => {
  const f = fixture(t)
  const action = { op: 'buy', type: '料理' }
  f.call('trpg_item', action, { requestId: 'old_buy' })
  const latest = f.call('trpg_narrate', { text: '继续了新的剧情' }).state
  const retry = f.call('trpg_item', action, { requestId: 'old_buy' })
  assert(retry.replayed)
  assert.equal(retry.state.revision, latest.revision)
  assert.equal(retry.state.notes.at(-1), '继续了新的剧情')
  assert.equal(retry.state.supplies, 2)
})

test('快照写入失败仍从已提交日志恢复，不谎报动作失败', (t) => {
  const f = fixture(t)
  const projection = path.join(f.root, 'save/slots/solo/case', `state.${process.pid}.tmp`)
  if (fs.existsSync(projection)) fs.unlinkSync(projection)
  fs.mkdirSync(projection)
  const result = f.call('trpg_narrate', { text: '快照失败时的有效事件' })
  assert(result.warning)
  assert.equal(f.read().notes.at(-1), '快照失败时的有效事件')
  assert(f.call('trpg_save', { op: 'verify' }).valid)
})

test('如雷额外攻击的最终反应伤害减半，不只是武器部分减半', (t) => {
  const f = fixture(t); open(f)
  setup(f, (s) => {
    for (const slot of ['生之花', '死之羽', '理之冠']) s.characters.pc.gear.artifacts[slot] = makeArtifact({ set: '如雷的盛怒', slot, quality: 4 })
  })
  f.call('trpg_combat', { op: 'start', enemies: [{ name: '急冻树', id: 'e' }] })
  setup(f, (s) => { s.battle.enemies[0].attached_element = '火' })
  f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'attack', target: 'e' })
  assert.equal(f.read().battle.order[f.read().battle.cursor].id, 'pc')
  const second = f.call('trpg_combat', { op: 'act', actor: 'pc', action: 'skill', target: 'e' })
  assert.equal(second.damage.reaction, '蒸发')
  assert.equal(second.damage.final, 22)
  assert.notEqual(second.state.battle.order[second.state.battle.cursor]?.id, 'pc')
})

test('兼容单层JSON对象字符串，记录中文原文并与对象重试保持幂等', t => {
  const f = fixture(t)
  const text = '记录一行中文与引号："第七例"\n下一行保留。'
  const payload = { text }
  const result = f.call('trpg_narrate', JSON.stringify(payload), { requestId: 'json_text_retry' })
  assert.equal(result.text, text)
  const beforeRetry = f.read()
  assert.equal(f.call('trpg_narrate', payload, { requestId: 'json_text_retry' }).replayed, true)
  assert.deepEqual(f.read(), beforeRetry)
  const event = new Journal(f.root, 'solo', 'case').records().find(e => e.requestId === 'json_text_retry')
  assert.deepEqual(event.input, payload)
  assert.equal(new Journal(f.root, 'solo', 'case').verify().valid, true)
})

test('损坏JSON、非对象、多重编码输入不写档，字符串不被当作代码执行', t => {
  const f = fixture(t)
  const before = f.read()
  for (const input of ['{bad', 'null', '[]', '42', 'true', JSON.stringify(JSON.stringify({ text: '不可多重解码' })), 'process.exit()', null, [], 42]) {
    assert.throws(() => f.call('trpg_narrate', input), /input/)
  }
  assert.deepEqual(f.read(), before)
})

test('旅行者数值同步保留自身已登记关系，双方关系不互相覆盖且跨实例延续', t => {
  const f = fixture(t)
  const call = f.call
  call('trpg_relation', { op: 'raise', actor: 'traveler', npc: 'pc', sourceId: 'shared_event_traveler', reason: '共同事件后登记旅行者一侧态度' })
  assert.equal(f.read().characters.traveler.relations.pc, '相识')
  assert.equal(f.read().characters.pc.relations.traveler, undefined)
  call('trpg_relation', { op: 'raise', actor: 'pc', npc: 'traveler', sourceId: 'shared_event_pc', reason: '另行登记玩家角色一侧关系' })
  call('trpg_narrate', { text: '继续旅途，没有发生关系变化' })
  const reloaded = new Runtime({ root: f.root }).execute({ tool: 'trpg_save', mode: 'solo', slot: 'case', input: { op: 'load' } }).state
  assert.equal(reloaded.characters.traveler.relations.pc, '相识')
  assert.equal(reloaded.characters.pc.relations.traveler, '相识')
  assert.equal(new Journal(f.root, 'solo', 'case').verify().valid, true)
})

test('世界线索兼容嵌套addThread，标准写法及请求重试保持一致', t => {
  const f = fixture(t)
  const args = { addThread: { id: 'lost_sister', text: '失踪者已获救，营地仍在' } }
  const result = f.call('trpg_state', args, { requestId: 'state-thread-lita-1' })
  assert.equal(result.state.world.threads.filter(x => x.id === 'lost_sister').length, 1)
  assert.equal(f.call('trpg_state', args, { requestId: 'state-thread-lita-1' }).replayed, true)
  f.call('trpg_state', { op: 'closeThread', id: 'lost_sister' })
  assert.equal(f.read().world.threads.find(x => x.id === 'lost_sister').status, 'closed')
  assert.equal(new Journal(f.root, 'solo', 'case').verify().valid, true)
})

test('世界线索拒绝含糊嵌套、未知字段与缺失op，失败不写档', t => {
  const f = fixture(t)
  const before = f.read()
  for (const input of [
    { addThread: null }, { addThread: [] },
    { op: 'addFact', addThread: { id: 'test', text: 'test' } },
    { addThread: { op: 'set', id: 'test', text: 'test' } },
    { addThread: { id: 'test', text: 'test' }, location: '错误地点' },
    { addThread: { id: 'test' } }, { text: '无操作字段' },
  ]) assert.throws(() => f.call('trpg_state', input))
  assert.deepEqual(f.read(), before)
  assert.throws(() => f.call('trpg_state', {}), /input 必须指定 op/)
})
