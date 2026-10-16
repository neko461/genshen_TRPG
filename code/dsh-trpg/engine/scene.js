/**
 * 剧情轮次。
 *
 * 对应 `数值定稿v1.0.md` 第四节。
 *
 * 与战斗轮次的分工：**剧情轮次统一行动**——全队作为一个整体，**一次检定代表全队**，
 * 由「最合适的人」主掷，队友可协助。**剧情失败不扣 HP**，只推进局势。
 *
 * 「场」（scene）= 一个地点 + 一个明确目标 + 1–3 次检定。
 * **「场景结束」是元素能量恢复的时点。**
 */

import { check } from './dice.js'
import { SCENE_CHECKS_PER_SCENE, SCENE_HELP_BONUS, SCENE_HELP_MAX } from './rules.js'

/**
 * 开一场戏。
 *
 * @param {object} input
 * @param {string} input.goal - 这场戏要达成什么（必须具体，不能是「探索一下」）。
 * @param {string} [input.location]
 * @param {string} [input.lead] - 主掷者 id（可选；不填则由 `pickLead` 选）。
 * @returns {object} 场状态。
 */
export function openScene(input) {
  if (typeof input?.goal !== 'string' || input.goal.trim() === '') {
    throw new Error('openScene: 必须给出具体的 goal（「这场戏要达成什么」）')
  }
  return {
    goal: input.goal.trim(),
    location: input.location ?? '',
    lead: input.lead ?? null,
    helpers: [],
    checks: [],
    closed: false,
    outcome: null,
  }
}

/**
 * 从队伍中选出最适合主掷的人。
 *
 * 规则：取该属性修正**最高**者。若并列，取标签更契合者（由调用方传入 `tagFit` 提示）。
 *
 * @param {Array<{id: string, name?: string, attributes: Record<string, number>, tags?: Array<{name: string}>}>} party
 * @param {string} attribute - 属性名。
 * @returns {{ lead: object, score: number }}
 */
export function pickLead(party, attribute) {
  if (!Array.isArray(party) || party.length === 0) {
    throw new Error('pickLead: 队伍不能为空')
  }
  let best = null
  let bestScore = -Infinity
  for (const member of party) {
    const score = member?.attributes?.[attribute] ?? 0
    if (score > bestScore) {
      best = member
      bestScore = score
    }
  }
  return { lead: best, score: bestScore }
}

/**
 * 计算协助加值。
 *
 * 每名队友用**叙事方式**提供合理协助则 +1，**上限 +2**。
 *
 * @param {number} helperCount - 提供了合理协助的队友数量。
 * @returns {{ bonus: number, effective: number, capped: boolean }}
 */
export function helpBonus(helperCount) {
  if (!Number.isInteger(helperCount) || helperCount < 0) {
    throw new Error(`helpBonus: 协助人数必须是非负整数，收到 ${JSON.stringify(helperCount)}`)
  }
  const raw = helperCount * SCENE_HELP_BONUS
  const effective = Math.min(raw, SCENE_HELP_MAX)
  return { bonus: raw, effective, capped: raw > SCENE_HELP_MAX }
}

/**
 * 在场景中做一次检定。
 *
 * **注意**：`mods.attribute` 必须由调用方从主掷者的角色卡查出，
 * **不接受模型直接传入**——防止 AI 给自己加值。
 *
 * @param {object} scene - 场状态（会被就地修改）。
 * @param {object} input
 * @param {string} input.attribute - 属性名。
 * @param {number} input.attributeMod - 主掷者该属性的修正（由引擎查卡得出）。
 * @param {number} [input.tagMod] - 标签修正（−1/0/+1）。
 * @param {number} [input.gearMod] - 装备修正（≤+1）。
 * @param {number} [input.difficulty] - 难度修正。
 * @param {number} [input.circumstance] - 处境修正。
 * @param {number} [input.helpers] - 提供合理协助的队友数量。
 * @param {string} [input.purpose] - 这次检定在做什么。
 * @param {() => number} [input.d6Source] - 注入的随机源（测试用）。
 * @returns {object} 检定结果（已并入 `scene.checks`）。
 */
export function sceneCheck(scene, input) {
  if (scene.closed === true) throw new Error('sceneCheck: 这场戏已经结束了')
  if (scene.checks.length >= SCENE_CHECKS_PER_SCENE.max) {
    throw new Error(
      `sceneCheck: 一场戏建议 ${SCENE_CHECKS_PER_SCENE.min}–${SCENE_CHECKS_PER_SCENE.max} 次检定，` +
      `已达上限；请结束本场或拆成新的一场`,
    )
  }

  const help = helpBonus(input.helpers ?? 0)
  const result = check(
    {
      attribute: input.attributeMod,
      tag: input.tagMod ?? 0,
      gear: input.gearMod ?? 0,
      circumstance: (input.circumstance ?? 0) + help.effective,
      difficulty: input.difficulty ?? 0,
    },
    input.d6Source,
  )

  const record = {
    attribute: input.attribute,
    purpose: input.purpose ?? '',
    helpers: input.helpers ?? 0,
    helpBonus: help.effective,
    helpCapped: help.capped,
    ...result,
  }
  scene.checks.push(record)
  return record
}

/**
 * 结束一场戏。
 *
 * **元素能量在此恢复**（这是「场景结束」的定义）。
 * **HP 恢复走 `短休` 层级（最大 HP 的 10%）**——由调用方对每名角色执行 `recover`。
 *
 * @param {object} scene - 场状态（会被就地修改）。
 * @param {object} [input]
 * @param {string} [input.summary] - 本场发生了什么（写入存档）。
 * @returns {{ outcome: string, recovery: string, energyRestored: boolean, checkCount: number, notes: string[] }}
 */
export function closeScene(scene, input = {}) {
  if (scene.closed === true) throw new Error('closeScene: 这场戏已经结束了')
  scene.closed = true

  const notes = []
  const tiers = scene.checks.map((c) => c.tier)

  let outcome = 'neutral'
  if (tiers.includes('critical_failure')) {
    outcome = 'setback'
    notes.push('本场出现大失败：局势明显恶化')
  } else if (tiers.includes('failure') && !tiers.includes('success') && !tiers.includes('critical_success')) {
    outcome = 'complicated'
    notes.push('本场检定未成功：GM 推进局势，而不是卡住玩家')
  } else if (tiers.includes('critical_success')) {
    outcome = 'excellent'
    notes.push('本场出现大成功：额外收益')
  } else if (tiers.includes('success') || tiers.includes('success_cost')) {
    outcome = 'success'
  }
  if (tiers.length === 0) {
    outcome = 'roleplay'
    notes.push('本场没有检定，按纯叙事结算')
  }

  scene.outcome = outcome
  scene.summary = input.summary ?? ''

  return {
    outcome,
    recovery: '短休：每名角色恢复最大 HP 的 10%',
    energyRestored: true,
    checkCount: scene.checks.length,
    notes,
  }
}

/**
 * 把一次「需要合力」的检定折算成用谁的属性。
 *
 * @param {Array<{id: string, attributes: Record<string, number>}>} party
 * @param {string} attribute
 * @param {boolean} [useWorst] - 是否有人明显拖后腿而改用最低值。
 * @returns {{ id: string, value: number, mode: 'best'|'worst' }}
 */
export function combinePartyAttribute(party, attribute, useWorst = false) {
  if (!Array.isArray(party) || party.length === 0) throw new Error('combinePartyAttribute: 队伍不能为空')
  let chosen = party[0]
  let best = chosen?.attributes?.[attribute] ?? 0
  for (const member of party) {
    const v = member?.attributes?.[attribute] ?? 0
    if (useWorst ? v < best : v > best) {
      chosen = member
      best = v
    }
  }
  return { id: chosen.id, value: best, mode: useWorst ? 'worst' : 'best' }
}

/**
 * 把一次需要多人分头做的行动拆成并行子场景。
 *
 * @param {Array<{id: string, goal?: string}>} tasks - 每名分头行动者的任务。
 * @returns {Array<object>} 子场景列表。
 */
export function splitParallelScenes(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error('splitParallelScenes: 任务列表不能为空')
  return tasks.map((t, i) => openScene({
    goal: t.goal ?? `并行子场景 ${i + 1}`,
    location: t.location ?? '',
    lead: t.id,
  }))
}
