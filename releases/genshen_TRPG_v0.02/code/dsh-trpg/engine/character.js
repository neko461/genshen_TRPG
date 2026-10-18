/**
 * 角色卡：建卡校验、数值派生、状态变更。
 *
 * 与设定文档的对应：
 * - 属性/标签/专长/HP/元素能量 → `数值定稿v1.0.md` §2
 * - 字段名兼容既有 `user/player.json` 与 `character_setting/npc.json`
 *
 * 设计约束：**本模块只做数值，不做叙事**。任何「应当如何描述」都交给 GM。
 */

import {
  ATTRIBUTES,
  CHARACTER,
  TAG_MODIFIER_RANGE,
  RELATION_TIERS,
  RELATION_MIN_FOR_HEALING,
  damageReductionFor,
  maxHpFor,
  validateBuild,
} from './rules.js'

/**
 * @typedef {object} BuildInput
 * @property {string} id - 角色 id，如 `pc_mei`。
 * @property {string} [name]
 * @property {'player'|'companion'|'npc'} [type]
 * @property {Record<string, number>} attributes - 六属性修正。
 * @property {Array<{name: string, modifier?: number, note?: string}>} [tags]
 * @property {string} [element]
 * @property {string} [weapon]
 * @property {boolean} [vision]
 */

/**
 * 建立一张角色卡。会强制校验属性分配。
 *
 * @param {BuildInput} input - 建卡输入。
 * @returns {object} 完整的角色卡对象。
 * @throws {Error} 属性分配非法时抛出（消息含具体原因）。
 */
export function createCharacter(input) {
  if (input === null || typeof input !== 'object') throw new Error('createCharacter: 输入必须是对象')
  if (typeof input.id !== 'string' || input.id.trim() === '') {
    throw new Error('createCharacter: 必须提供非空的 id')
  }

  const checkResult = validateBuild(input.attributes)
  if (!checkResult.ok) throw new Error(`createCharacter: ${checkResult.reason}`)

  const physique = input.attributes.体魄
  const hp = maxHpFor(physique)

  const tags = normalizeTags(input.tags)

  return {
    id: input.id,
    type: input.type ?? 'player',
    name: input.name ?? '',
    region: input.region ?? '',
    element: input.element ?? null,
    weapon: input.weapon ?? '',
    vision: input.vision ?? false,
    attributes: pickAttributes(input.attributes),
    tags,
    expertises: [],
    state: {
      hp,
      max_hp: hp,
      elemental_energy: CHARACTER.energyStart,
      max_elemental_energy: CHARACTER.energyMax,
      status: [],
      temporary_tags: [],
      attached_element: null,
      shield: 0,
    },
    gear: {
      weapon: null,
      artifacts: { 生之花: null, 死之羽: null, 理之冠: null },
    },
    relations: {},
    goal: '',
    bond: '',
    secret: '',
    equipment: [],
    background: '',
    gm_hooks: [],
  }
}

/**
 * 归一化标签列表并校验数量与修正范围。
 * @param {Array<object>} [tags]
 * @returns {Array<{name: string, modifier: number, note: string}>}
 */
export function normalizeTags(tags) {
  if (tags === undefined || tags === null) return []
  if (!Array.isArray(tags)) throw new Error('normalizeTags: 标签必须是数组')
  if (tags.length > CHARACTER.tagsMax) {
    throw new Error(`normalizeTags: 标签最多 ${CHARACTER.tagsMax} 个，收到 ${tags.length}`)
  }
  return tags.map((t, i) => {
    if (t === null || typeof t !== 'object') throw new Error(`normalizeTags: 第 ${i + 1} 个标签必须是对象`)
    const name = typeof t.name === 'string' ? t.name.trim() : ''
    if (name === '') throw new Error(`normalizeTags: 第 ${i + 1} 个标签缺少 name`)
    const modifier = t.modifier ?? 1
    if (!Number.isInteger(modifier) || modifier < TAG_MODIFIER_RANGE.min || modifier > TAG_MODIFIER_RANGE.max) {
      throw new Error(
        `normalizeTags: 标签「${name}」的 modifier 必须在 ${TAG_MODIFIER_RANGE.min}..${TAG_MODIFIER_RANGE.max}，收到 ${modifier}`,
      )
    }
    return { name, modifier, note: t.note ?? '' }
  })
}

/**
 * 按 id 从标签列表中查出一个标签的修正。
 *
 * 单次检定最多用 1 个标签（见 rules.js `CAPS.tagsPerCheck`），因此本函数一次只查一个。
 *
 * @param {object} character - 角色卡。
 * @param {string} tagName - 标签名（精确匹配）。
 * @returns {number} 该标签的修正；不存在时抛错（避免 AI 用不存在的标签白拿加值）。
 */
export function tagModifier(character, tagName) {
  const all = [...(character.tags ?? []), ...(character.state?.temporary_tags ?? [])]
  const found = all.find((t) => t.name === tagName)
  if (found === undefined) {
    const available = all.map((t) => t.name).join('、') || '（无）'
    throw new Error(`tagModifier: 角色「${character.id}」没有标签「${tagName}」。可用标签：${available}`)
  }
  return found.modifier
}

/**
 * 追加一个标签（成长用）。受 `CHARACTER.tagsMax` 限制。
 * @param {object} character - 角色卡（会被就地修改）。
 * @param {{name: string, modifier?: number, note?: string}} tag - 新标签。
 */
export function addTag(character, tag) {
  const next = normalizeTags([...(character.tags ?? []), tag])
  character.tags = next
}

/**
 * 追加一项专长（成长用）。受 `CHARACTER.expertisesMax` 限制。
 * @param {object} character - 角色卡（会被就地修改）。
 * @param {{name: string, text: string}} expertise - 专长。
 */
export function addExpertise(character, expertise) {
  if (typeof expertise?.name !== 'string' || expertise.name.trim() === '') {
    throw new Error('addExpertise: 专长必须有非空 name')
  }
  character.expertises = character.expertises ?? []
  if (character.expertises.length >= CHARACTER.expertisesMax) {
    throw new Error(`addExpertise: 专长最多 ${CHARACTER.expertisesMax} 项，已满`)
  }
  if (character.expertises.some((e) => e.name === expertise.name)) {
    throw new Error(`addExpertise: 专长「${expertise.name}」已存在`)
  }
  character.expertises.push({ name: expertise.name, text: expertise.text ?? '' })
}

/**
 * 应用一次状态变更。
 *
 * HP 归零**不死亡**，自动转入「重伤」状态（`数值定稿v1.0` §9.1 与规则原文）。
 *
 * @param {object} character - 角色卡（会被就地修改）。
 * @param {object} delta - 变更量。
 * @param {number} [delta.hp] - HP 增减（可为负）。
 * @param {number} [delta.energy] - 元素能量增减。
 * @param {string[]} [delta.addStatus] - 追加的状态。
 * @param {string[]} [delta.removeStatus] - 移除的状态。
 * @param {string|null} [delta.attachedElement] - 设置附着元素。
 * @returns {{ before: object, after: object, downed: boolean, notes: string[] }}
 */
export function applyDelta(character, delta = {}) {
  const before = snapshot(character)
  const notes = []

  if (delta.hp !== undefined) {
    const next = character.state.hp + delta.hp
    character.state.hp = Math.max(0, Math.min(character.state.max_hp, next))
  }
  if (delta.energy !== undefined) {
    const next = character.state.elemental_energy + delta.energy
    character.state.elemental_energy = clamp(next, 0, character.state.max_elemental_energy)
    if (next > character.state.max_elemental_energy) notes.push('元素能量已达上限')
  }
  if (delta.addStatus !== undefined) {
    for (const s of delta.addStatus) {
      if (!character.state.status.includes(s)) character.state.status.push(s)
    }
  }
  if (delta.removeStatus !== undefined) {
    character.state.status = character.state.status.filter((s) => !delta.removeStatus.includes(s))
  }
  if (delta.attachedElement !== undefined) {
    character.state.attached_element = delta.attachedElement
  }

  // HP 归零 → 重伤，不死亡。
  let downed = false
  if (character.state.hp <= 0 && !character.state.status.includes('重伤')) {
    character.state.status.push('重伤')
    downed = true
    notes.push('HP 归零：不死亡，转为「重伤」。可由 GM 在「重伤/倒下/被俘/失去重要东西」中择一叙述。')
  }

  return { before, after: snapshot(character), downed, notes }
}

/**
 * 按四层级恢复 HP。
 * @param {object} character - 角色卡（会被就地修改）。
 * @param {'喘息'|'短休'|'扎营'|'休整'} level - 恢复层级。
 * @param {Record<string, {ratio: number, clears: string}>} recoveryTable - 恢复表（来自 rules.RECOVERY）。
 * @returns {{ healed: number, hp: number, note: string }}
 */
export function recover(character, level, recoveryTable) {
  const entry = recoveryTable[level]
  if (entry === undefined) throw new Error(`recover: 未知恢复层级「${level}」`)
  const hpBefore = character.state.hp
  const requested = Math.floor(character.state.max_hp * entry.ratio)
  character.state.hp = Math.min(character.state.max_hp, character.state.hp + requested)
  const healed = character.state.hp - hpBefore
  const energyBefore = character.state.elemental_energy
  if (level === '扎营' || level === '休整') character.state.elemental_energy = character.state.max_elemental_energy

  let note = `${level}：恢复 ${healed} 点 HP`
  if (entry.clears === 'all') {
    character.state.status = character.state.status.filter((s) => s === '重伤')
    note += '；清除全部临时状态（「重伤」需剧情手段解除）'
  } else if (entry.clears === 'all_temporary') {
    character.state.status = character.state.status.filter((s) => s === '重伤')
    note += '；清除全部临时状态'
  } else if (entry.clears === 'one_temporary') {
    const idx = character.state.status.findIndex((s) => s !== '重伤')
    if (idx >= 0) {
      character.state.status.splice(idx, 1)
      note += '；移除一项临时状态'
    }
  }
  if (entry.ratio === 0) note = '喘息：不恢复 HP（元素能量在场景结束时恢复）'
  const energyRestored = character.state.elemental_energy - energyBefore
  if (energyRestored > 0) note += `；恢复 ${energyRestored} 点元素能量`
  return { healed, hp: character.state.hp, energyRestored, note }
}

/**
 * 校验一项治疗是否可以由某 NPC 提供（需要关系值达标）。
 * @param {object} character - 接受治疗的角色。
 * @param {string} npcId - 提供治疗的 NPC id。
 * @returns {{ ok: boolean, relation: string|null, reason?: string }}
 */
export function canReceiveHealingFrom(character, npcId) {
  const relation = character.relations?.[npcId] ?? null
  if (relation === null) {
    return { ok: false, relation: null, reason: `与「${npcId}」尚无关系记录` }
  }
  const needIdx = RELATION_TIERS.indexOf(RELATION_MIN_FOR_HEALING)
  const haveIdx = RELATION_TIERS.indexOf(relation)
  if (haveIdx < 0) return { ok: false, relation, reason: `关系值「${relation}」不在四阶之内` }
  if (haveIdx < needIdx) {
    return { ok: false, relation, reason: `需要关系达到「${RELATION_MIN_FOR_HEALING}」，当前为「${relation}」` }
  }
  return { ok: true, relation }
}

/**
 * 提升与某 NPC 的关系值（只升不降）。
 * @param {object} character - 角色卡（会被就地修改）。
 * @param {string} npcId - NPC id。
 * @param {'陌生'|'相识'|'信任'|'羁绊'} to - 目标阶。
 * @returns {{ from: string|null, to: string, changed: boolean }}
 */
export function raiseRelation(character, npcId, to) {
  if (!RELATION_TIERS.includes(to)) {
    throw new Error(`raiseRelation: 关系阶必须是 ${RELATION_TIERS.join('/')}，收到 ${to}`)
  }
  character.relations = character.relations ?? {}
  const from = character.relations[npcId] ?? null
  if (from !== null && RELATION_TIERS.indexOf(to) <= RELATION_TIERS.indexOf(from)) {
    return { from, to: from, changed: false }
  }
  character.relations[npcId] = to
  return { from, to, changed: true }
}

/**
 * 取角色当前的伤害减免（体魄 + 装备）。
 * @param {object} character - 角色卡。
 * @param {number} [gearReduction] - 装备提供的额外减免。
 * @returns {number}
 */
export function totalReduction(character, gearReduction = 0) {
  const physique = character.attributes?.体魄 ?? 0
  return damageReductionFor(physique) + gearReduction
}

/**
 * 状态快照（用于事件日志与前后对比）。
 * @param {object} character
 * @returns {object}
 */
export function snapshot(character) {
  return {
    id: character.id,
    hp: character.state.hp,
    max_hp: character.state.max_hp,
    elemental_energy: character.state.elemental_energy,
    max_elemental_energy: character.state.max_elemental_energy,
    status: [...character.state.status],
    attached_element: character.state.attached_element,
    shield: character.state.shield,
  }
}

function pickAttributes(attrs) {
  const out = {}
  for (const name of ATTRIBUTES) out[name] = attrs[name]
  return out
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v))
}
