/**
 * 元素反应与伤害结算链。
 *
 * 对应 `数值定稿v1.0.md` 第七节与 `light_rule/elemental_reaction.md`。
 *
 * 核心规则：
 * - 反应按**无序元素对**匹配（`水+冰` 与 `冰+水` 同判冻结）。
 * - 触发后**附着元素被消耗**。
 * - 伤害结算链：`武器伤害 → + 元素反应加成 → + 圣遗物加成 → − 目标减伤`。
 * - **法器「元素亲和」在「元素反应加成」这一步生效**（×2）。
 */

import {
  REACTION_AMPLIFY_BONUS,
  REACTION_TRANSFORM_BONUS,
  DOT,
} from './rules.js'

/**
 * 反应定义表。
 *
 * `pair` 为无序元素对，按字典序规范化后匹配，因此 `火+水` 与 `水+火` 命中同一条。
 * `kind`：
 * - `amplify` 增幅型（固定 +20）
 * - `transform` 剧变型（固定 +10）
 * - `control` 控制型（无直接加成，施加状态）
 * - `defense` 防御型（无直接加成，提供护盾/防御）
 * - `special` 特殊（扩散、激化、绽放）
 */
export const REACTIONS = Object.freeze([
  { name: '蒸发', pair: ['水', '火'], kind: 'amplify', bonus: REACTION_AMPLIFY_BONUS, alt: '制造蒸汽掩护' },
  { name: '融化', pair: ['冰', '火'], kind: 'amplify', bonus: REACTION_AMPLIFY_BONUS, alt: '破除冰甲' },
  { name: '冻结', pair: ['水', '冰'], kind: 'control', bonus: 0, status: '冻结', effect: '目标束缚，下回合跳过攻击（不掷命中）' },
  { name: '超载', pair: ['火', '雷'], kind: 'transform', bonus: REACTION_TRANSFORM_BONUS, effect: '击退，可破坏地形' },
  { name: '感电', pair: ['水', '雷'], kind: 'transform', bonus: REACTION_TRANSFORM_BONUS, dot: true, effect: '持续伤害，可连锁附近目标' },
  { name: '超导', pair: ['冰', '雷'], kind: 'defense', bonus: 0, effect: '目标减伤 −10，物理攻击更有效' },
  { name: '扩散', pair: ['风', '*'], kind: 'special', bonus: 0, effect: '把元素效果传给附近目标' },
  { name: '结晶', pair: ['岩', '*'], kind: 'defense', bonus: 0, shield: true, effect: '获得护盾：敌人命中目标值 +1' },
  { name: '燃烧', pair: ['草', '火'], kind: 'transform', bonus: REACTION_TRANSFORM_BONUS, dot: true, effect: '持续伤害，制造火场' },
  { name: '激化', pair: ['草', '雷'], kind: 'special', bonus: 0, effect: '下一次草/雷伤害 +20' },
  { name: '绽放', pair: ['水', '草'], kind: 'transform', bonus: REACTION_TRANSFORM_BONUS, effect: '生成草原核，遇火爆炸（+20）' },
])

/** 已知元素。 */
export const ELEMENTS = Object.freeze(['风', '岩', '雷', '草', '水', '火', '冰'])

/**
 * 查询一次攻击会触发什么反应。
 *
 * @param {string|null} attackerElement - 攻击方元素。
 * @param {string|null} attachedElement - 目标已附着的元素。
 * @returns {object|null} 反应定义；无反应时返回 `null`。
 */
export function findReaction(attackerElement, attachedElement) {
  if (!attackerElement || !attachedElement) return null
  if (attackerElement === attachedElement) return null
  for (const r of REACTIONS) {
    const [a, b] = r.pair
    // 通配：`风+已附着` / `岩+已附着`
    if (b === '*') {
      if (a === attackerElement) return r
      continue
    }
    // 无序匹配
    if ((a === attackerElement && b === attachedElement) || (a === attachedElement && b === attackerElement)) {
      return r
    }
  }
  return null
}

/**
 * 伤害结算链。
 *
 * @param {object} input
 * @param {number} input.weaponDamage - 武器基础伤害（已含品质加成）。
 * @param {number} [input.bonusDamage] - 圣遗物等提供的固定伤害加成。
 * @param {string|null} [input.attackerElement] - 攻击元素。
 * @param {string|null} [input.attachedElement] - 目标已附着元素。
 * @param {boolean} [input.catalystAffinity] - 是否为法器「元素亲和」（反应加成 ×2）。
 * @param {number} [input.targetReduction] - 目标伤害减免。
 * @param {boolean} [input.firstRound] - 是否战斗第一轮（用于弓的「先手狙击」）。
 * @param {string|null} [input.weaponTrait] - 攻击者的武器特效名。
 * @param {string|null} [input.tier] - 判定档位（大成功/成功/成功带代价）。
 * @returns {{
 *   weapon: number, reaction: string|null, reactionBonus: number, traitBonus: number,
 *   bonus: number, subtotal: number, reduction: number, final: number,
 *   statuses: string[], notes: string[], dot: {rounds: number, damagePerRound: number}|null,
 *   targetReductionDelta: number, consumesAttached: boolean
 * }}
 */
export function resolveDamage(input) {
  const weapon = reqNum(input.weaponDamage, 'weaponDamage')
  const bonusDamage = input.bonusDamage ?? 0
  const targetReduction = input.targetReduction ?? 0
  const notes = []
  const statuses = []

  // ---- 0. 未命中：不造成伤害，也不触发反应、不消耗附着 ----
  if (input.tier === 'failure' || input.tier === 'critical_failure') {
    return {
      weapon,
      reaction: null,
      reactionBonus: 0,
      traitBonus: 0,
      bonus: 0,
      subtotal: 0,
      reduction: 0,
      final: 0,
      statuses: [],
      notes: ['未命中：不造成伤害'],
      dot: null,
      targetReductionDelta: 0,
      consumesAttached: false,
    }
  }

  // ---- 1. 反应 ----
  const reaction = findReaction(input.attackerElement ?? null, input.attachedElement ?? null)
  let reactionBonus = 0
  let dot = null
  let targetReductionDelta = 0
  if (reaction !== null) {
    reactionBonus = reaction.bonus
    if (input.catalystAffinity === true && reactionBonus > 0) {
      reactionBonus *= 2
      notes.push('法器「元素亲和」：元素反应加成 ×2')
    }
    if (reaction.status) statuses.push(reaction.status)
    if (reaction.dot === true) {
      dot = { rounds: DOT.defaultRounds, damagePerRound: DOT.damagePerRound }
      notes.push(`${reaction.name}：持续伤害 ${DOT.defaultRounds} 轮，每轮 ${DOT.damagePerRound}`)
    }
    if (reaction.status === '冻结') {
      notes.push('冻结：目标下回合跳过攻击（不掷命中）')
    }
    if (reaction.name === '超导') targetReductionDelta -= 10
    if (reaction.shield === true) statuses.push('结晶护盾')
    if (reaction.effect) notes.push(reaction.effect)
    else if (reaction.alt) notes.push(reaction.alt)
  }

  // ---- 2. 武器特效 ----
  let traitBonus = 0
  const trait = input.weaponTrait ?? null
  if (trait === '先手狙击' && input.firstRound === true) {
    traitBonus += 15
    notes.push('弓「先手狙击」：第一轮命中伤害 +15')
  }
  if (trait === '连击' && input.tier === 'critical_success') {
    traitBonus += 20
    notes.push('单手剑「连击」：大成功追加 20 伤害')
  }
  if (trait === '破防') {
    targetReductionDelta -= 15
    notes.push('双手剑「破防」：目标减伤 −15')
  }

  // ---- 3. 档位调整 ----
  let tierBonus = 0
  if (input.tier === 'success_cost') {
    tierBonus = -Math.ceil(weapon / 2)
    notes.push('成功带代价：伤害减半')
  }

  // ---- 4. 结算 ----
  // 减伤是「先加上攻击带来的减伤变化 delta，再与基础减伤相抵」。
  // delta 为负（破防 −15 / 超导 −10）时，目标实际减伤下降。
  const subtotal = weapon + tierBonus + reactionBonus + traitBonus + bonusDamage
  const reduction = Math.max(-30, targetReduction + targetReductionDelta)
  const final = Math.max(0, subtotal - reduction)

  return {
    weapon,
    reaction: reaction?.name ?? null,
    reactionBonus,
    traitBonus,
    bonus: bonusDamage,
    subtotal,
    reduction,
    final,
    statuses,
    notes: notes.filter((n) => n !== ''),
    dot,
    targetReductionDelta,
    consumesAttached: reaction !== null,
  }
}

function reqNum(v, name) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`resolveDamage: ${name} 必须是有限数字，收到 ${JSON.stringify(v)}`)
  }
  return v
}
