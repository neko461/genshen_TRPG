import { safeId } from './journal.js'
import { deriveStats, refreshStats, syncTraveler } from './stats.js'
import { applyDelta } from './character.js'
import { ATTRIBUTES } from './rules.js'
import { check, DIFFICULTY } from './dice.js'
import { tagModifier } from './character.js'
import { sceneCharacters, battleCharacters, travelerStatus } from './participation.js'

export const STATIONS = ['蒙德', '璃月', '稻妻', '须弥', '枫丹', '纳塔', '回蒙德·风花节', '挪德卡莱', '至冬']
export function requireValue(ok, text) { if (!ok) throw new Error(text) }
export function integer(n, low, high, label) { requireValue(Number.isInteger(n) && n >= low && n <= high, `${label}须为 ${low}–${high} 的整数`); return n }
export function nonempty(s, label, max = 500) { requireValue(typeof s === 'string' && s.trim().length > 0 && s.length <= max, `${label}须为 1–${max} 字`); return s.trim() }
export function actorOf(s, id) { safeId(id, '角色'); const a = s.characters[id]; requireValue(a, `找不到角色 ${id}`); return a }
export function outsideBattle(s) { requireValue(!s.battle || s.battle.over, '战斗中不能进行此操作') }
export function activeScene(s) { requireValue(s.scene && !s.scene.closed, '请先打开一个有明确目标的场景'); return s.scene }
export function living(s) { return (s.battle && !s.battle.over ? battleCharacters(s) : sceneCharacters(s)).filter((a) => a.state.hp > 0) }
export function refreshAll(s) { for (const a of Object.values(s.characters)) if (a.type === 'player') refreshStats(a); syncTraveler(s) }
export function heal(actor, amount) {
  const bonus = actor.derived?.healingBonus ?? 0
  return applyDelta(actor, { hp: Math.floor(amount * (1 + bonus)) })
}
export function newState(mode, slot, input) {
  const stationIndex = input.startStation === undefined ? 0 : STATIONS.indexOf(input.startStation)
  requireValue(stationIndex >= 0, `开局站点无效；可选：${STATIONS.join('、')}`)
  const station = STATIONS[stationIndex]
  const location = input.startLocation === undefined
    ? (stationIndex === 0 ? '蒙德城·冒险家协会' : station)
    : nonempty(input.startLocation, '开局地点', 120)
  return {
    version: '0.0.1', schema_version: '0.01', mode, slot, title: nonempty(input.title ?? (stationIndex === 0 ? '蒙德的第一份委托' : `${station}的第一段旅程`), '战役名', 80), revision: 0,
    settings: { spoiler_max: '剧情', lethality: 'non_lethal' }, timeline: { index: stationIndex + 1, name: station },
    world: { location, safe: true, day: 1, flags: {}, threads: [], known_facts: [], anchors: [], statueDay: 0, startStationChosen: input.startStation !== undefined },
    characters: {}, inventory: {}, supplies: 3, sources: [], scene: null, sceneSerial: 0, battle: null, battleSerial: 0,
    support: null, relations: {}, notes: stationIndex === 0 ? [] : [`玩家选择从${station}开场；更早站点未经历、未完成，不自动视为已解决。`], party: { traveler: { met: false, joined: false, present: false } },
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
    relations: s.relations, party: s.party ?? { traveler: { ...travelerStatus(s) } }, notes: s.notes.slice(-30) }
}
/**
 * 场外一致性提示：只报告可确证的状态矛盾，不替 GM 推断叙事内容。
 *
 * `scene_day_drift` 针对真实发生的缺陷——场景已跨日，但 `scene.goal` 仍写着旧日期的目标，
 * 主持会照着过期目标跑（如「第9日上午」而战役日已到第10日）。
 * 旧档没有 `scene.openDay` 时不推断，避免把兼容档误报为漂移。
 */
export function consistencyWarnings(s, sceneOpenDay) {
  const warnings = []
  for (const thread of s.world.threads ?? []) if (thread.status === 'open' && Number.isInteger(thread.deadlineDay) && s.world.day > thread.deadlineDay) {
    warnings.push({ kind: 'thread_deadline_passed', threadId: thread.id, deadlineDay: thread.deadlineDay, day: s.world.day,
      text: `事项${thread.id}已超过第${thread.deadlineDay}日截止时间：${thread.deadlineConsequence}。先呈现实际后果、核对保存/验货条件；关闭时须提供resolution，不得默认为完好或照常成功。` })
  }
  const scene = s.scene
  const openDay = Number.isInteger(scene?.openDay) ? scene.openDay : sceneOpenDay
  if (scene && !scene.closed && Number.isInteger(openDay) && Number.isInteger(s.world.day) && s.world.day > openDay) {
    warnings.push({
      kind: 'scene_day_drift', sceneId: scene.id, openDay, day: s.world.day,
      text: `场景 ${scene.id} 于第 ${openDay} 日打开，战役日已到第 ${s.world.day} 日，但场景目标仍写着旧日期的安排。`
        + '请先按已发生的行动关闭旧场景并重述目标，再开始当前日；不要沿用过期目标，也不要用改日期的方式掩盖漂移。',
    })
  }
  return warnings
}
/**
 * 旧档的 `scene` 没有 `openDay` 时，从日志中推导该场景打开当日的战役日。
 * 只读推导，不写回存档、不迁移 Journal；无法确证时返回 `null`，宁可不提示也不误报。
 */
export function inferSceneOpenDay(records, sceneId) {
  if (!sceneId) return null
  for (const event of records) {
    const opened = event.command === 'trpg_scene' && event.input?.op === 'open' && event.after?.scene?.id === sceneId
    if (opened && Number.isInteger(event.after.world?.day)) return event.after.world.day
  }
  return null
}
/**
 * 把 `trpg_apply` 的 HP 写法归一成唯一形态，使「damage:12」与「hp:-12」是同一次操作：
 * 重试时换了等价写法也能命中幂等回放，不会二次扣血。
 *
 * HP 只有一种无歧义语义——`hp` 是带符号增减（负=伤害，正=治疗）。
 * 曾经把绝对目标值当增量传入（`{hp:132}` 意在把 150 设成 132），被上限夹成 150→150，
 * 伤势静默丢失（2026-10-17 蒙德实机），因此另给正向的 `damage`/`heal`，并拒绝三者混用。
 */
export function normalizeApplyInput(input) {
  const fields = ['hp', 'damage', 'heal'].filter(k => input[k] !== undefined)
  requireValue(fields.length <= 1, 'hp、damage、heal 只能用一个：hp 为带符号增减（-18 伤害 / +8 治疗），damage/heal 为正数')
  const patch = { ...input }
  if (input.damage !== undefined) {
    integer(input.damage, 1, 1000, '伤害值')
    patch.hp = -input.damage
  } else if (input.heal !== undefined) {
    integer(input.heal, 1, 1000, '治疗值')
    patch.hp = input.heal
  } else if (input.hp !== undefined) {
    integer(input.hp, -1000, 1000, 'HP 变更（带符号：负为伤害，正为治疗）')
  }
  delete patch.damage
  delete patch.heal
  return patch
}
/**
 * 把绝对目标值误当增量的写法挡在写入之前。
 *
 * 判定依据是可确证的状态，不是猜意图：治疗量大于「当前缺口」时，这个正数不可能是本意，
 * 几乎必然是把目标值当成了增量（当前150传 hp:132 想变成132）。宁可直接报错要求改写，
 * 也不接受一个会被上限夹成 150→150 的空操作——那正是伤势静默丢失的成因。
 */
export function requireSurvivableHeal(actor, patch) {
  if (patch.hp === undefined || patch.hp <= 0) return
  const max = actor.state.max_hp
  const missing = max - actor.state.hp
  requireValue(patch.hp <= missing,
    `本次治疗 +${patch.hp} 超出当前缺口（HP ${actor.state.hp}/${max}，还差 ${missing}）。`
    + 'hp 是带符号增减，不是绝对目标值：若你想把 HP 设成某个数，请用目标值减去当前值，或直接传 heal/damage。')
}
/**
 * 叙事写入后的即时一致性提示。
 *
 * `traveler_met_unrecorded` 针对真实发生的缺陷：正文已经让旅行者/派蒙当面出场交谈，
 * 但 `party.traveler.met` 仍为 false。到达此处说明该人名出现在**引擎自己的事务记录**里，
 * 不是对自然语言的猜测，因此可以确证并提示。不擅自替你改状态：
 * 见面须是玩家经历的事实，由 GM 按剧情调用 trpg_party 登记。
 */
export function narrateConsistency(s, text) {
  const party = s.party?.traveler
  // 固定试玩档/旧档已有旅行者角色卡，视为已经登记，不重复提示。
  const warnings = []
  if (party && !party.met && !s.characters?.traveler && /旅行者|派蒙/.test(text)) {
    warnings.push({
      kind: 'traveler_met_unrecorded',
      text: '本段叙事提到旅行者或派蒙，但 party.traveler.met 仍为 false。若玩家确实已在剧情中与他们当面相见，'
        + '请按实际事件调用 trpg_party traveler(action:"meet", reason:…) 登记；若只是听说、远处看到或转述，'
        + '则保持未结识，不要为了消掉提示而登记。',
    })
  }
  // 章节完成宣告必须对应已记录的核心危机，而不能用原创外围事件的善后代替。
  // 蒙德实机曾以自创风场的阶段性收束宣布"蒙德篇结束"，风龙危机却从未推进。
  if (/篇(?:主线)?(?:结束|完成|收束)|(?:结束|完成|收尾)了?(?:本章|这篇|蒙德篇|璃月篇|稻妻篇|须弥篇|枫丹篇|纳塔篇)/.test(text)) {
    const open = (s.world.threads ?? []).filter(t => t.status === 'open')
    warnings.push({
      kind: 'chapter_completion_claim',
      station: s.timeline.name, openThreads: open.map(t => t.id),
      text: `本段正文出现「${s.timeline.name}」篇或章结束的宣告。按主线规则，章节完成须以已记录的核心危机事实为准：`
        + '核对主线规则该章的核心事件（如蒙德的风龙特瓦林、深渊干预、风龙废墟与余波）是否真的发生并落档，'
        + '不能以原创外围事件的善后或"城市暂时平静"替代。'
        + (open.length ? `本站仍有未收束事项：${open.map(t => t.id).join('、')}。` : '')
        + '若关键阶段未完成，应改写为阶段性进展，不宣布整章结束；确实完成才用 nextStation。',
    })
  }
  return warnings.length ? { warnings } : {}
}
