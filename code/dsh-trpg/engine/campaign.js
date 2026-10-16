import { safeId } from './journal.js'
import { deriveStats, refreshStats, syncTraveler } from './stats.js'
import { applyDelta } from './character.js'
import { ATTRIBUTES } from './rules.js'
import { check, DIFFICULTY } from './dice.js'
import { tagModifier } from './character.js'

export const STATIONS = ['蒙德', '璃月', '稻妻', '须弥', '枫丹', '纳塔', '回蒙德·风花节', '挪德卡莱', '至冬']
export function requireValue(ok, text) { if (!ok) throw new Error(text) }
export function integer(n, low, high, label) { requireValue(Number.isInteger(n) && n >= low && n <= high, `${label}须为 ${low}–${high} 的整数`); return n }
export function nonempty(s, label, max = 500) { requireValue(typeof s === 'string' && s.trim().length > 0 && s.length <= max, `${label}须为 1–${max} 字`); return s.trim() }
export function actorOf(s, id) { safeId(id, '角色'); const a = s.characters[id]; requireValue(a, `找不到角色 ${id}`); return a }
export function outsideBattle(s) { requireValue(!s.battle || s.battle.over, '战斗中不能进行此操作') }
export function activeScene(s) { requireValue(s.scene && !s.scene.closed, '请先打开一个有明确目标的场景'); return s.scene }
export function living(s) { return Object.values(s.characters).filter((a) => a.state.hp > 0) }
export function refreshAll(s) { for (const a of Object.values(s.characters)) if (a.type === 'player') refreshStats(a); syncTraveler(s) }
export function heal(actor, amount) {
  const bonus = actor.derived?.healingBonus ?? 0
  return applyDelta(actor, { hp: Math.floor(amount * (1 + bonus)) })
}
export function newState(mode, slot, input) {
  return {
    version: '0.0.1', schema_version: '0.01', mode, slot, title: nonempty(input.title ?? '蒙德的第一份委托', '战役名', 80), revision: 0,
    settings: { spoiler_max: '剧情', lethality: 'non_lethal' }, timeline: { index: 1, name: STATIONS[0] },
    world: { location: '蒙德城·冒险家协会', safe: true, day: 1, flags: {}, threads: [], known_facts: [], anchors: [], statueDay: 0 },
    characters: {}, inventory: {}, supplies: 3, sources: [], scene: null, sceneSerial: 0, battle: null, battleSerial: 0,
    support: null, relations: {}, notes: [],
  }
}
export function checkActor(actor, input, d6Source, help = 0) {
  requireValue(actor.power?.status !== 'pending', '特殊能力角色尚待设定审核与玩家确认；拒绝判定')
  requireValue(actor.state.hp > 0 && !actor.state.status.includes('重伤'), '倒下或重伤角色不能进行普通行动')
  const attr = input.attribute ?? '灵巧'
  requireValue(ATTRIBUTES.includes(attr), '未知属性')
  const difficulty = input.difficulty ?? '普通'
  requireValue(Object.hasOwn(DIFFICULTY, difficulty), '未知难度')
  const circumstance = integer(input.circumstance ?? 0, -1, 1, '处境修正')
  const support = actor.pendingSupport ? 1 : circumstance
  actor.pendingSupport = false
  return check({ attribute: actor.attributes[attr], tag: input.tag ? tagModifier(actor, input.tag) : 0, gear: 0, circumstance: support + integer(help, 0, 2, '协助'), difficulty: DIFFICULTY[difficulty] }, d6Source)
}
export function publicState(s) {
  // 运行状态不装 GM 秘密；事件输入/快照不透传到玩家界面。
  return { version: s.version, mode: s.mode, slot: s.slot, title: s.title, revision: s.revision, timeline: s.timeline, world: s.world,
    characters: s.characters, inventory: s.inventory, supplies: s.supplies, scene: s.scene, battle: s.battle, support: s.support,
    relations: s.relations, notes: s.notes.slice(-30) }
}
