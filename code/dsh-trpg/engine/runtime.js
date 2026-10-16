import fs from 'node:fs'
import path from 'node:path'
import { randomInt } from 'node:crypto'
import { Journal, safeId } from './journal.js'
import { createCharacter, applyDelta, recover, addTag, addExpertise, normalizeTags } from './character.js'
import { BUILD_SCHEMES, ATTRIBUTES, RECOVERY, RELATION_TIERS, WEAPONS } from './rules.js'
import { listEnemies } from './enemies.js'
import { ARTIFACT_SETS, listWeapons } from './gear.js'
import { rollExpression, DIFFICULTY, CAPS } from './dice.js'
import { openScene, closeScene } from './scene.js'
import { newState, publicState, requireValue as need, nonempty, integer, actorOf, outsideBattle, activeScene, checkActor, refreshAll, heal, STATIONS } from './campaign.js'
import { openBattle, playerAction, enemyAction, nextRound, currentTurn } from './battle.js'
import { grantItem, useItem, equipItem, upgrade, ITEM_TYPES } from './inventory.js'
import { searchLore } from './lore.js'
import { OPENING, CREATION_GUIDE } from './opening.js'

export const VERSION = 'genshen_TRPG_v0.01'
export const TOOL_NAMES = ['trpg_save', 'trpg_char', 'trpg_roll', 'trpg_check', 'trpg_apply', 'trpg_recover', 'trpg_scene', 'trpg_combat', 'trpg_combat_attack', 'trpg_combat_advance', 'trpg_item', 'trpg_gear', 'trpg_party', 'trpg_relation', 'trpg_state', 'trpg_narrate', 'trpg_recap', 'trpg_lore', 'trpg_rules']

function object(x) { need(x && typeof x === 'object' && !Array.isArray(x), 'input 必须是对象'); return x }
export function normalizeToolInput(input = {}) {
  if (typeof input === 'string') {
    try { input = JSON.parse(input) }
    catch { throw new Error('input 字符串不是合法JSON对象；请直接传 {"text":"内容"} 这样的对象，不要传损坏的引号文本') }
  }
  need(input && typeof input === 'object' && !Array.isArray(input), 'input 必须是对象；不接受数组、null、数字或多重编码字符串')
  return input
}
function once(s, source) { safeId(source, '来源编号'); need(!s.sources.includes(source), '该来源已结算，不能重复领奖'); s.sources.push(source) }
function parseTags(input, max = 3) {
  need(Array.isArray(input) && input.length <= max, `标签须为数组且最多 ${max} 个`)
  const tags = normalizeTags(input.map((tag) => {
    if (typeof tag === 'string') return { name: nonempty(tag, '标签', 40), modifier: 1 }
    object(tag)
    need(tag.note === undefined || (typeof tag.note === 'string' && tag.note.length <= 500), '标签说明须为至多500字的字符串')
    return { name: nonempty(tag.name, '标签', 40), modifier: integer(tag.modifier ?? 1, -1, 1, '标签修正'), note: tag.note?.trim() ?? '' }
  }))
  need(new Set(tags.map((t) => t.name)).size === tags.length, '标签名不能重复')
  return tags
}
function addCharacter(s, input) {
  outsideBattle(s)
  const id = safeId(input.id, '角色编号'); need(id !== 'traveler' && !Object.hasOwn(s.characters, id), '角色编号保留或已存在')
  const count = Object.values(s.characters).filter((a) => a.type === 'player').length
  need(count < (s.mode === 'solo' ? 1 : 4), '该模式玩家位已满')
  const weapon = input.weapon ?? '单手剑'; need(Object.hasOwn(WEAPONS, weapon), '未知武器')
  const powerType = input.powerType ?? (input.vision === true ? 'vision' : 'mundane')
  need(['vision', 'mundane', 'custom'].includes(powerType), '能力来源须为 vision/mundane/custom')
  const vision = powerType === 'vision'
  need(input.vision === undefined || input.vision === vision, '神之眼声明与能力来源冲突')
  const element = vision ? input.element : null
  need(!vision || ['风', '岩', '雷', '草', '水', '火', '冰'].includes(element), '请选择一种神之眼元素')
  need(vision || input.element == null, '无神之眼或待审核能力不能直接指定元素')
  need(vision || weapon !== '法器', '无元素能力不能以法器直接发动元素攻击；可改用其他武器或提交特殊能力提案')
  const ability = powerType === 'custom' ? {
    source: nonempty(input.ability?.source, '特殊能力来源'), effect: nonempty(input.ability?.effect, '特殊能力效果'),
    limits: nonempty(input.ability?.limits, '特殊能力限制'), cost: nonempty(input.ability?.cost, '特殊能力代价'),
  } : null
  const tags = parseTags(input.tags ?? ['冒险家', '野外追踪', '遗迹调查'])
  const attributes = input.attributes ?? BUILD_SCHEMES[input.scheme ?? '均衡']; need(attributes, '未知建卡方案')
  const actor = createCharacter({ id, name: nonempty(input.name ?? '初行者', '角色名', 40), type: 'player', attributes, element, weapon,
    vision, region: input.region ?? '蒙德', tags })
  actor.background = input.background ? nonempty(input.background, '背景', 1000) : ''
  actor.motivation = input.motivation ? nonempty(input.motivation, '冒险动机') : ''
  actor.power = { type: powerType, status: ability ? 'pending' : 'approved', proposal: ability }
  actor.gear.weapon = { type: weapon, quality: 1 }
  s.characters[id] = actor; refreshAll(s)
  return actor
}

export class Runtime {
  constructor({ root, d6Source, random } = {}) {
    this.root = path.resolve(root ?? process.cwd())
    this.rng = { d6: d6Source, random: random ?? (() => randomInt(0, 0x100000000) / 0x100000000) }
  }
  execute(request) {
    object(request)
    const { tool, mode, slot, requestId, expectedRevision } = request
    const input = normalizeToolInput(request.input)
    need(TOOL_NAMES.includes(tool), '未知工具')
    const journal = new Journal(this.root, mode, slot)
    if (tool === 'trpg_char' && input.op === 'opening') return { opening: OPENING, creation: CREATION_GUIDE, gmInstructions: fs.readFileSync(new URL('../prompt/gm-system.md', import.meta.url), 'utf8'), gmMainline: fs.readFileSync(new URL('../prompt/mainline-rules.md', import.meta.url), 'utf8') }
    if (tool === 'trpg_rules') return { version: VERSION, schemes: BUILD_SCHEMES, caps: CAPS, difficulty: DIFFICULTY, recovery: RECOVERY, enemies: listEnemies(), artifactSets: ARTIFACT_SETS, weapons: listWeapons() }
    if (tool === 'trpg_save' && input.op === 'list') {
      const result = {}
      for (const m of ['solo', 'multi']) {
        const base = path.join(this.root, 'save', 'slots', m)
        result[m] = fs.existsSync(base) ? fs.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []
      }
      return result
    }
    if (tool === 'trpg_save' && input.op === 'verify') return journal.verify()
    if ((tool === 'trpg_save' && ['status', 'load', 'export'].includes(input.op)) || tool === 'trpg_recap') {
      const state = journal.load()
      const limit = integer(input.limit ?? 20, 1, 100, '摘要条数')
      return { state: publicState(state), recentEvents: journal.records().slice(-limit).map(({ id, at, command }) => ({ id, at, command })), integrity: journal.verify() }
    }
    if (tool === 'trpg_lore') return searchLore(journal.load(), input)
    if (tool === 'trpg_combat' && input.op === 'roster') return { enemies: listEnemies(), budget: 4 }
    if (tool === 'trpg_gear' && input.op === 'catalog') return { weapons: listWeapons(), sets: ARTIFACT_SETS }
    if (tool === 'trpg_item' && input.op === 'list') { const s = journal.load(); return { supplies: s.supplies, inventory: s.inventory } }
    if (tool === 'trpg_char' && input.op === 'list') return { characters: journal.load().characters }
    if (tool === 'trpg_char' && input.op === 'get') return { actor: actorOf(journal.load(), input.id) }
    if (tool === 'trpg_state' && input.op === 'get') return { state: publicState(journal.load()) }

    const create = tool === 'trpg_save' && ['new', 'demo'].includes(input.op)
    return journal.commit(tool, input, (old) => {
      let s = create ? newState(mode, slot, input) : old
      let result
      if (tool === 'trpg_save') {
        need(create, '未知存档操作')
        if (input.op === 'demo') {
          need(mode === 'solo', '固定试玩场景仅用于单人档')
          addCharacter(s, { id: 'pc', name: input.name ?? '初行者', attributes: { 体魄: 0, 灵巧: 2, 心智: 1, 感知: 1, 交涉: 0, 意志: -1 }, powerType: 'vision', element: input.element ?? '水' })
          for (const item of [
            { id: 'food', type: '料理', quantity: 2 }, { id: 'potion', type: '药剂', quantity: 2 },
            { id: 'flower', type: '圣遗物', set: '冒险家', slot: '生之花', quality: 2 },
            { id: 'material', type: '圣遗物', set: '冒险家', slot: '生之花', quality: 2 },
          ]) grantItem(s, item)
          s.notes.push('固定试玩：协会的遗失货箱。先开场勘查，再追踪足迹，最后清理瞭望台。台词是预设文本，骰点和结算实时执行。')
        }
        result = { state: publicState(s) }
      } else if (tool === 'trpg_char') {
        if (input.op === 'create') result = { actor: addCharacter(s, input) }
        else if (input.op === 'setTags') {
          outsideBattle(s)
          need(!s.scene || s.scene.closed, '标签修正须在场景外，不能为当前检定临时改卡')
          const actor = actorOf(s, input.id)
          need(actor.type === 'player', '仅可修正玩家标签')
          need(input.playerConfirmed === true, '须经玩家确认才能修正标签')
          const reason = nonempty(input.reason, '标签修正原因')
          const before = structuredClone(actor.tags)
          const tags = parseTags(input.tags, Math.max(3, actor.tags.length))
          actor.tags = tags
          result = { actor, correction: { before, after: tags, reason } }
        }
        else if (input.op === 'approvePower') {
          outsideBattle(s)
          need(!s.scene || s.scene.closed, '特殊能力须在场景外审核，不能临时改卡解围')
          const actor = actorOf(s, input.id)
          need(actor.power?.status === 'pending', '没有待审核的特殊能力')
          need(input.playerConfirmed === true, '须先向玩家展示裁定并取得确认')
          // Only an existing attribute/tag check is supported here; never execute prose as code or invent bonuses.
          need(input.mechanic === 'narrative', '本版特殊能力仅支持叙事与既有属性检定；新增数值机制须先实现规则')
          actor.power = { ...actor.power, status: 'approved', mechanic: 'narrative', ruling: nonempty(input.reason, '设定审核与适用范围') }
          result = { actor }
        }
        else if (input.op === 'grow') {
          outsideBattle(s); const actor = actorOf(s, input.id); once(s, nonempty(input.source, '成长来源', 48))
          need(actor.type === 'player', '旅行者随玩家动态成长')
          if (input.tag) {
            const tag = parseTags([input.tag])[0]
            need(!actor.tags.some((old) => old.name === tag.name), '标签名不能重复')
            addTag(actor, tag)
          }
          else if (input.expertise) addExpertise(actor, { name: nonempty(input.expertise, '专长', 40), text: nonempty(input.description, '专长描述') })
          else {
            need(ATTRIBUTES.includes(input.attribute), '未知属性'); need(!actor.attributeGrown && actor.attributes[input.attribute] < 3, '全程属性只能增长一次且上限 +3')
            actor.attributes[input.attribute]++; actor.attributeGrown = true
          }
          refreshAll(s); result = { actor }
        } else throw new Error('未知角色操作')
      } else if (tool === 'trpg_roll') {
        const expr = nonempty(input.expr, '骰式', 40)
        need(/^(?:[1-9]|[1-9]\d)?d6(?:[+-]\d{1,2})?$/.test(expr), 'v0.01 通用骰只支持 1–99 个 d6 及整数修正')
        result = { roll: rollExpression(expr, this.rng.d6), purpose: nonempty(input.purpose ?? '通用判定', '用途') }
      } else if (tool === 'trpg_scene' || tool === 'trpg_check') {
        result = this.scene(s, { ...input, op: tool === 'trpg_check' ? 'check' : input.op })
      } else if (tool === 'trpg_combat') {
        if (input.op === 'start') result = openBattle(s, input)
        else if (input.op === 'act') result = playerAction(s, input, this.rng)
        else if (input.op === 'enemy') result = enemyAction(s, this.rng)
        else if (input.op === 'advance') result = nextRound(s)
        else throw new Error('未知战斗操作')
      } else if (tool === 'trpg_combat_attack') result = playerAction(s, { ...input, action: input.action ?? 'attack' }, this.rng)
      else if (tool === 'trpg_combat_advance') result = nextRound(s)
      else if (tool === 'trpg_item') result = this.items(s, input)
      else if (tool === 'trpg_gear') {
        if (input.op === 'equip') result = equipItem(s, input)
        else if (input.op === 'upgrade') result = upgrade(s, input)
        else throw new Error('未知装备操作')
      } else if (tool === 'trpg_recover') result = this.rest(s, input)
      else if (tool === 'trpg_party') result = this.party(s, input)
      else if (tool === 'trpg_relation') result = this.relation(s, input)
      else if (tool === 'trpg_state') result = this.world(s, input)
      else if (tool === 'trpg_narrate') {
        const text = nonempty(input.text, '叙事', 3000); s.notes.push(text); s.notes = s.notes.slice(-100); result = { text }
      } else if (tool === 'trpg_apply') {
        outsideBattle(s); nonempty(input.reason, 'GM 裁定原因')
        const actor = actorOf(s, input.actor)
        if (input.hp !== undefined) integer(input.hp, -1000, 1000, 'HP 变更')
        if (input.energy !== undefined) integer(input.energy, -10, 10, '能量变更')
        if (input.removeStatus?.includes('重伤')) nonempty(input.treatment, '解除重伤的剧情医治依据')
        for (const key of ['addStatus', 'removeStatus']) if (input[key]) need(Array.isArray(input[key]) && input[key].length <= 10 && input[key].every((x) => typeof x === 'string' && x.length <= 30), '状态列表无效')
        result = applyDelta(actor, input)
      } else throw new Error('该操作尚未启用')
      refreshAll(s)
      return { state: s, result: { ...result, state: publicState(s) } }
    }, { create, requestId, expectedRevision })
  }
  scene(s, input) {
    outsideBattle(s)
    if (input.op === 'open') {
      need(!s.scene || s.scene.closed, '上一场景尚未关闭')
      const scene = openScene({ goal: nonempty(input.goal, '目标'), location: nonempty(input.location ?? s.world.location, '地点') })
      Object.assign(scene, { id: `S${++s.sceneSerial}`, members: Object.keys(s.characters), itemUses: {}, progress: false, restGiven: false })
      s.scene = scene; s.world.location = scene.location; s.world.safe = input.safe === true; s.support = null
      return { scene }
    }
    const scene = activeScene(s)
    if (input.op === 'check') {
      need(scene.checks.length < 3, '一场戏最多三次检定；请结束并推进真实场景')
      const actor = actorOf(s, input.actor)
      need(actor.id !== 'traveler' || input.allowTraveler === true, '默认由玩家主掷；旅行者代掷须玩家明确请求')
      const helpers = input.helpers ?? []
      need(Array.isArray(helpers) && helpers.length <= 2 && new Set(helpers).size === helpers.length, '协助列表须至多两个不同队友')
      for (const id of helpers) need(id !== actor.id && actorOf(s, id).state.hp > 0, '协助者无效')
      const npcHelp = input.useSupport === true ? 1 : 0
      if (npcHelp) need(s.support && !s.support.suspended, '没有可用 NPC 支援')
      const bonus = Math.min(2, helpers.length + npcHelp)
      const check = checkActor(actor, input, this.rng.d6, bonus)
      const record = { actor: actor.id, purpose: nonempty(input.purpose ?? scene.goal, '检定目的'), helpers, npc: npcHelp ? s.support.id : null, ...check }
      scene.checks.push(record); scene.progress = true
      if (input.unlockFlag && !['failure', 'critical_failure'].includes(check.tier)) {
        need(['road_clue'].includes(input.unlockFlag), '未知剧情解锁条件'); s.world.flags[input.unlockFlag] = true
      }
      return { check: record }
    }
    if (input.op === 'close') {
      const result = closeScene(scene, { summary: nonempty(input.summary ?? scene.goal, '场景总结') })
      const meaningful = scene.progress || scene.hadBattle
      const recovery = []
      if (meaningful) for (const a of Object.values(s.characters)) {
        const r = scene.restGiven ? { healed: 0 } : recover(a, '短休', RECOVERY)
        a.state.elemental_energy = a.state.max_elemental_energy
        recovery.push({ actor: a.id, ...r, energy: a.state.elemental_energy })
      }
      s.support = null
      return { ...result, energyRestored: Boolean(meaningful), recovery, note: meaningful ? '已实际结算场景恢复' : '纯空场景不产生恢复，避免拆场景刷资源' }
    }
    throw new Error('未知场景操作')
  }
  items(s, input) {
    if (input.op === 'use') return useItem(s, input)
    outsideBattle(s)
    if (input.op === 'buy') {
      need(s.world.safe && s.supplies >= 1, '购买须安全且补给不少于 1')
      need(['料理', '药剂', '绷带', '机关材料'].includes(input.type), '商店只售普通消耗品')
      s.supplies--; return { item: grantItem(s, { id: input.id ?? `shop_${s.revision}`, type: input.type, quantity: 2 }) }
    }
    if (input.op === 'grant') {
      nonempty(input.reason, '奖励依据'); once(s, input.sourceId)
      need(Array.isArray(input.items) && input.items.length <= 10, '一次最多 10 类物品')
      const items = input.items.map((item) => grantItem(s, item))
      return { items }
    }
    if (input.op === 'reward') {
      once(s, input.sourceId); nonempty(input.reason, '委托完成依据'); s.supplies = Math.min(6, s.supplies + 1)
      if (s.scene && !s.scene.closed) {
        const used = s.scene.rewardUses ??= {}
        for (const a of Object.values(s.characters)) if (!used[a.id]) {
          if (a.derived.three === '幸运儿') heal(a, 10)
          if (input.kind === '宝箱' && a.derived.three === '冒险家') heal(a, Math.floor((a.state.max_hp - a.state.hp) * 0.3))
          used[a.id] = true
        }
        s.scene.progress = true
      }
      return { supplies: s.supplies }
    }
    if (input.op === 'gather') {
      const scene = activeScene(s); once(s, input.sourceId); scene.progress = true
      return { item: grantItem(s, { id: input.id, type: '机关材料', name: nonempty(input.name, '材料名称'), quantity: 1 }) }
    }
    throw new Error('未知物品操作')
  }
  rest(s, input) {
    outsideBattle(s)
    need(['喘息', '扎营', '休整', '神像'].includes(input.level), '短休仅由场景结束结算')
    need(s.world.safe || input.level === '喘息', '须先确认当前地点安全')
    if (input.level === '扎营') { need(s.supplies >= 1, '扎营补给不足'); s.supplies--; s.world.day++ }
    if (input.level === '休整') { nonempty(input.reason, '安全休整及时间流逝依据'); s.world.day++ }
    const scene = input.level === '神像' ? activeScene(s) : null
    if (scene) {
      need(s.world.statueDay !== s.world.day && !scene.restGiven, '本日神像恩泽或本场短休已使用')
      need(input.anchor && s.world.anchors.some((a) => a.id === input.anchor && a.kind === '神像' && a.station === s.timeline.index), '请先现场激活当前站点神像')
      s.world.statueDay = s.world.day; scene.restGiven = true; scene.progress = true
    }
    const recovery = Object.values(s.characters).map((a) => ({ actor: a.id, ...recover(a, scene ? '短休' : input.level, RECOVERY) }))
    return { recovery, supplies: s.supplies, day: s.world.day }
  }
  party(s, input) {
    if (input.op === 'support') {
      activeScene(s)
      const actor = actorOf(s, input.actor)
      need(!s.world.flags[`betray_${input.npc}`], '重大背叛尚未修复，该 NPC 暂不协作')
      need(['信任', '羁绊'].includes(actor.relations[input.npc]), '需要与该 NPC 达到信任，或先记录任务协作关系')
      nonempty(input.reason, 'NPC 愿意且能够协作的依据')
      need(['安柏', '凯亚', '丽莎', '迪卢克'].includes(input.name), 'v0.01 支援白名单为安柏、凯亚、丽莎、迪卢克；其他 NPC 先按剧情互动')
      need(!s.support || s.support.id === input.npc, '每场只能一名 NPC 支援')
      s.support = { id: safeId(input.npc, 'NPC 编号'), name: nonempty(input.name, 'NPC 名称'), reason: input.reason }
      return { support: s.support }
    }
    if (input.op === 'assist') {
      const b = s.battle; need(b && !b.over && s.support && !b.supportUsed, '需要可用支援且本战尚未使用')
      const t = currentTurn(s); need(t?.side === 'party' && t.id === input.actor, '只能支援当前行动者')
      actorOf(s, input.actor).pendingSupport = true; b.supportUsed = true
      return { support: s.support, circumstance: 1 }
    }
    if (input.op === 'unlock') {
      outsideBattle(s); nonempty(input.reason, '已达地区共鸣依据')
      const allowed = ['风', '岩', '雷', '草', '水', '火', '冰']
      const needed = { 风: 1, 岩: 2, 雷: 3, 草: 4, 水: 5, 火: 6, 冰: 9 }
      need(allowed.includes(input.element) && s.timeline.index >= needed[input.element], '尚未到可共鸣阶段')
      const traveler = actorOf(s, 'traveler')
      if (!traveler.unlockedElements.includes(input.element)) traveler.unlockedElements.push(input.element)
      return { unlocked: traveler.unlockedElements }
    }
    throw new Error('未知队伍操作；切换元素用战斗 switch 动作')
  }
  relation(s, input) {
    outsideBattle(s); const actor = actorOf(s, input.actor); const id = safeId(input.npc, 'NPC 编号')
    const old = actor.relations[id] ?? '陌生'
    if (input.op === 'get') return { relation: old }
    nonempty(input.reason, '关系事件原因'); once(s, input.sourceId)
    if (input.op === 'raise') {
      const index = RELATION_TIERS.indexOf(old); need(index < 3, '已达到羁绊')
      actor.relations[id] = RELATION_TIERS[index + 1]
    } else if (input.op === 'betray') {
      s.world.flags[`betray_${id}`] = true
      if (s.support?.id === id) s.support = null
    } else if (input.op === 'repair') s.world.flags[`betray_${id}`] = false
    else throw new Error('未知关系操作')
    return { npc: id, from: old, to: actor.relations[id] ?? old }
  }
  world(s, input) {
    outsideBattle(s)
    // Accept the unambiguous nested spelling produced by older GM calls.
    if (Object.hasOwn(input, 'addThread')) {
      need(Object.keys(input).length === 1 && input.addThread && typeof input.addThread === 'object' && !Array.isArray(input.addThread), 'addThread 写法冲突；请使用 {op:"addThread",id:"线索编号",text:"线索内容"}')
      need(Object.keys(input.addThread).every(key => ['id', 'text'].includes(key)), 'addThread 仅接收 id/text；标准写法为 {op:"addThread",id,text}')
      input = { ...input.addThread, op: 'addThread' }
    }
    if (input.op === 'set') {
      nonempty(input.reason, '世界状态变化依据')
      if (input.location !== undefined) s.world.location = nonempty(input.location, '地点')
      if (input.safe !== undefined) { need(typeof input.safe === 'boolean', 'safe 须为布尔值'); s.world.safe = input.safe }
      if (input.flagKey) {
        const key = safeId(input.flagKey, '旗标'); need(typeof input.flagValue === 'boolean', '剧情旗标仅接受布尔值'); s.world.flags[key] = input.flagValue
      }
    } else if (input.op === 'addThread') {
      const id = safeId(input.id, '线索编号'); need(!s.world.threads.some((t) => t.id === id), '线索编号重复')
      s.world.threads.push({ id, text: nonempty(input.text, '线索'), status: 'open' })
    } else if (input.op === 'closeThread') {
      const t = s.world.threads.find((t) => t.id === input.id); need(t, '线索不存在'); t.status = 'closed'
    } else if (input.op === 'addFact') s.world.known_facts.push(nonempty(input.text, '已知事实'))
    else if (input.op === 'anchor') {
      need(s.world.safe, '须现场确认安全后激活')
      const id = safeId(input.id, '锚点编号'); need(!s.world.anchors.some((a) => a.id === id), '锚点已激活')
      need(['锚点', '神像'].includes(input.kind ?? '锚点'), '未知地标类型')
      s.world.anchors.push({ id, name: nonempty(input.name, '地标名'), location: s.world.location, station: s.timeline.index, kind: input.kind ?? '锚点' })
    } else if (input.op === 'teleport') {
      need(s.world.safe, '追逐、封锁或危险中不能传送')
      const from = s.world.anchors.find((a) => a.id === input.from), to = s.world.anchors.find((a) => a.id === input.to)
      need(from && to && from.location === s.world.location && from.station === s.timeline.index && to.station === s.timeline.index, '须从当前安全地标到同站已知地标')
      s.world.location = to.location
    } else if (input.op === 'nextStation') {
      need(!s.scene || s.scene.closed, '先结束当前场景')
      need(s.timeline.index < STATIONS.length, '已到最终站')
      nonempty(input.reason, '当前站点主线完成依据')
      s.timeline.index++; s.timeline.name = STATIONS[s.timeline.index - 1]; s.world.location = s.timeline.name; s.world.safe = true
    } else throw new Error('未知世界状态操作：input 必须指定 op（get/set/addThread/closeThread/addFact/anchor/teleport/nextStation）；例如 {op:"addThread",id:"线索编号",text:"线索内容"}')
    return { world: s.world, timeline: s.timeline }
  }
}
