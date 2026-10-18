/**
 * 战斗轮次。
 *
 * 对应 `数值定稿v1.0.md` 第三、八节。
 *
 * 与剧情轮次的分工：**战斗轮次逐个行动、按个人先攻排序**；剧情轮次统一行动（见 scene.js）。
 *
 * 关键规则：
 * - **4 轮硬上限**，到点强制 `stalemate`，由 GM 用局势转折收场。
 * - 敌人**掷命中**：`2d6 + 威胁修正 ≥ 7 + 防御加值 + 姿态加值`。
 * - 敌人数值按队伍人数 `n` 缩放：HP `× n`，群攻 `×(1+0.10n)`，单体 `×(1−0.10n)`。
 * - 首领可多阶段，共用 HP、按阈值切换；每阶段至多 4 轮，超时结束整场。
 */

import { rollDice } from './rng.js'
import { resolveDamage, findReaction } from './damage.js'
import { resolveEnemy, validateEncounter } from './enemies.js'
import {
  AOE_SCALE_PER_N,
  COMBAT_ROUND_CAP,
  DEFEND_STANCE_BONUS,
  ENEMY_BASE,
  ENEMY_BASE_SOLO,
  ENEMY_HIT_TARGET,
  SINGLE_SCALE_PER_N,
  WEAPONS,
} from './rules.js'

/**
 * 按队伍人数缩放一个敌人的数值。
 *
 * @param {1|2|3} threat - 威胁等级。
 * @param {number} n - 队伍人数（单人档为 1）。
 * @param {boolean} [soloMode] - 是否使用单人档最终值（仅影响首领）。
 * @returns {{ threat: number, label: string, hp: number, aoe: number|null, single: number|null, attacksPerRound: number, hitMod: number }}
 */
export function scaleEnemy(threat, n, soloMode = false) {
  if (!Number.isInteger(n) || n < 1 || n > 4) throw new Error(`scaleEnemy: 队伍人数必须是 1–4 的整数，收到 ${n}`)
  if (soloMode && n !== 1) throw new Error('scaleEnemy: 单人档缩放人数固定为 1')
  if (!Number.isInteger(threat)) throw new Error('scaleEnemy: 威胁等级必须为整数')
  const table = soloMode && ENEMY_BASE_SOLO[threat] !== undefined ? ENEMY_BASE_SOLO : ENEMY_BASE
  const base = table[threat]
  if (base === undefined) throw new Error(`scaleEnemy: 未知威胁等级 ${threat}（应为 1..3）`)

  return {
    threat,
    label: base.label,
    hp: base.hpBase * n,
    aoe: base.aoeBase === null ? null : Math.round(base.aoeBase * (soloMode && threat === 3 ? 1 : 1 + AOE_SCALE_PER_N * n)),
    single: base.singleBase === null ? null : Math.round(base.singleBase * (soloMode && threat === 3 ? 1 : 1 + SINGLE_SCALE_PER_N * n)),
    attacksPerRound: base.attacksPerRound,
    hitMod: base.hitMod,
  }
}

/**
 * 计算一个单位的先攻值。
 *
 * @param {object} input
 * @param {number} input.perception - 感知属性修正。
 * @param {string} [input.weaponType] - 武器类型。
 * @param {number} [input.gearInitiative] - 圣遗物提供的先攻加成。
 * @param {number} [input.circumstance] - 情境修正（如埋伏 +2）。
 * @returns {number}
 */
export function initiativeOf(input) {
  const weapon = input.weaponType === undefined ? 0 : (WEAPONS[input.weaponType]?.initiative ?? 0)
  return (input.perception ?? 0) + weapon + (input.gearInitiative ?? 0) + (input.circumstance ?? 0)
}

/**
 * 开始一场战斗。
 *
 * @param {object} input
 * @param {number} input.partyN - 队伍人数（决定敌人数值缩放）。
 * @param {Array<{id: string, name?: string, initiative: number, threat: number}>} input.enemies - 敌人列表（`threat` 为威胁等级）。
 * @param {Array<{id: string, name?: string, initiative: number}>} input.party - 我方列表。
 * @param {boolean} [input.soloMode] - 是否单人档。
 * @param {number} [input.phases] - 首领阶段数（默认 1）。
 * @returns {object} 战斗状态。
 */
export function startCombat(input) {
  const n = input.partyN ?? input.party?.length ?? 1
  const soloMode = input.soloMode === true
  const definitions = (input.enemies ?? []).map(resolveEnemy)
  const encounter = validateEncounter(definitions)
  const phases = input.phases ?? 1
  if (!Number.isInteger(phases) || phases < 1 || phases > 3) throw new Error('首领阶段数必须为 1–3')
  if (phases > 1 && !definitions.some((e) => e.threat === 3)) throw new Error('仅首领可开启多阶段')

  const enemies = definitions.map((e, i) => {
    const scaled = scaleEnemy(e.threat, n, soloMode)
    return {
      id: e.id ?? `enemy_${i + 1}`,
      name: e.name ?? scaled.label,
      threat: e.threat,
      template: e.template,
      element: e.element,
      mechanic: e.mechanic,
      hp: scaled.hp,
      max_hp: scaled.hp,
      aoe: scaled.aoe,
      single: scaled.single,
      attacksPerRound: scaled.attacksPerRound,
      hitMod: scaled.hitMod,
      initiative: e.initiative ?? scaled.hitMod,
      reduction: 0,
      status: [],
      attached_element: null,
    }
  })

  // 整场敌方每轮至多一次群攻，其余劲敌仅保留一次单体。
  const aoeLeader = [...enemies].filter((e) => e.aoe !== null).sort((a, b) => b.threat - a.threat)[0]
  for (const enemy of enemies) {
    enemy.aoeEligible = enemy === aoeLeader
    if (enemy.aoe !== null && !enemy.aoeEligible) {
      enemy.aoe = null
      enemy.attacksPerRound = 1
    }
  }

  const party = (input.party ?? []).map((p, i) => ({
    id: p.id ?? `pc_${i + 1}`,
    name: p.name ?? p.id ?? `pc_${i + 1}`,
    initiative: p.initiative ?? 0,
    stance: '攻击',
    acted: false,
  }))

  const order = [...party.map((p) => ({ side: 'party', id: p.id, initiative: p.initiative })),
    ...enemies.map((e) => ({ side: 'enemy', id: e.id, initiative: e.initiative }))]
    .sort((a, b) => (b.initiative - a.initiative) || (a.side === 'party' ? -1 : 1))

  return {
    round: 1,
    roundsCompleted: 0,
    phase: 1,
    phases,
    encounter,
    partyN: n,
    soloMode,
    order,
    enemies,
    party,
    over: false,
    outcome: null,
    log: [],
  }
}

/**
 * 敌人掷命中。
 *
 * @param {object} enemy - 敌人（含 `hitMod`）。
 * @param {object} [target] - 受击方（含 `gearTargetBonus`、`stance`）。
 * @param {() => number} [d6Source] - 注入的随机源（测试用）。
 * @returns {{ roll: number, dice: number[], targetNumber: number, hit: boolean }}
 */
export function enemyAttackRoll(enemy, target = {}, d6Source) {
  const dice = d6Source === undefined ? rollDice(2) : [d6Source(), d6Source()]
  const roll = dice[0] + dice[1] + (enemy.hitMod ?? 0)

  let tn = ENEMY_HIT_TARGET + (target.gearTargetBonus ?? 0)
  if (target.stance === '防御') tn += DEFEND_STANCE_BONUS

  return { roll, dice, targetNumber: tn, hit: roll >= tn }
}

/**
 * 按仇恨权重从队伍中选一个目标。
 *
 * @param {Array<{id: string, threat?: number, gearThreatBonus?: number}>} candidates - 我方可被选中的单位。
 * @param {() => number} [random] - 返回 0..1 的随机函数（测试用）。
 * @returns {{ target: object, weights: Array<{id: string, weight: number, probability: number}> }}
 */
export function pickTarget(candidates, random = Math.random) {
  const list = (candidates ?? []).map((c) => ({
    ref: c,
    id: c.id,
    weight: Math.max(0, (c.threat ?? 1.0) + (c.gearThreatBonus ?? 0)),
  }))
  const total = list.reduce((a, b) => a + b.weight, 0)
  if (total <= 0) throw new Error('pickTarget: 全部候选的仇恨权重为 0，无法选择目标')

  const r = random() * total
  let acc = 0
  let chosen = list[list.length - 1]
  for (const item of list) {
    acc += item.weight
    if (r < acc) {
      chosen = item
      break
    }
  }

  return {
    target: chosen.ref,
    weights: list.map((i) => ({ id: i.id, weight: i.weight, probability: i.weight / total })),
  }
}

/**
 * 结算一次玩家攻击（含反应与减伤）。
 *
 * @param {object} input
 * @param {number} input.weaponDamage
 * @param {string} [input.weaponType]
 * @param {number} [input.weaponQuality]
 * @param {string|null} [input.attackerElement]
 * @param {object} input.targetEnemy - 敌人对象（会读取 `attached_element`、`reduction`、`hp`）。
 * @param {number} [input.targetReduction] - 目标额外减伤。
 * @param {string} [input.tier] - 检定档位。
 * @param {boolean} [input.firstRound]
 * @param {number} [input.gearDamageBonus]
 * @param {boolean} [input.catalystAffinity]
 * @returns {{ resolved: object, hpBefore: number, hpAfter: number, downed: boolean }}
 */
export function resolvePlayerAttack(input) {
  const weapon = WEAPONS[input.weaponType] ?? null
  const quality = input.weaponQuality ?? 1
  const weaponDamage = input.weaponDamage ?? (weapon === null ? 25 : weapon.damage + qualityBonus(quality))

  const target = input.targetEnemy
  if (target === null || target === undefined) throw new Error('resolvePlayerAttack: 缺少 targetEnemy')

  // 防御型反应（超导）会降低目标减伤
  const baseReduction = (target.reduction ?? 0) + (input.targetReduction ?? 0)

  const resolved = resolveDamage({
    weaponDamage,
    bonusDamage: input.gearDamageBonus ?? 0,
    attackerElement: input.attackerElement ?? null,
    attachedElement: target.attached_element ?? null,
    catalystAffinity: input.catalystAffinity === true,
    targetReduction: baseReduction,
    firstRound: input.firstRound === true,
    weaponTrait: quality >= 3 ? (weapon?.trait ?? null) : null,
    tier: input.tier,
  })

  const hpBefore = target.hp
  target.hp = Math.max(0, target.hp - resolved.final)
  if (resolved.targetReductionDelta !== 0) {
    target.reduction = (target.reduction ?? 0) + resolved.targetReductionDelta
  }
  if (resolved.consumesAttached) target.attached_element = null
  for (const s of resolved.statuses) {
    if (!target.status.includes(s)) target.status.push(s)
  }

  return { resolved, hpBefore, hpAfter: target.hp, downed: target.hp <= 0 }
}

/**
 * 推进一轮并给出结束判定。
 *
 * @param {object} state - `startCombat` 返回的战斗状态（会被就地修改）。
 * @param {object} [options]
 * @param {boolean} [options.forceEnd] - 强制结束（由 GM 判定）。
 * @returns {{ round: number, phase: number, over: boolean, outcome: string|null, forceStalemate: boolean, notes: string[] }}
 */
export function advanceRound(state, options = {}) {
  const notes = []
  if (state.over) throw new Error('advanceRound: 战斗已经结束')
  const aliveEnemies = state.enemies.filter((e) => e.hp > 0)

  if (aliveEnemies.length === 0) {
    state.over = true
    state.outcome = 'victory'
    return { round: state.round, phase: state.phase, over: true, outcome: 'victory', forceStalemate: false, notes: ['敌人已被击退'] }
  }

  if (options.forceEnd === true) {
    state.over = true
    state.outcome = 'ended'
    return { round: state.round, phase: state.phase, over: true, outcome: 'ended', forceStalemate: false, notes: ['战斗由 GM 判定结束'] }
  }

  state.roundsCompleted = (state.roundsCompleted ?? 0) + 1

  // 4 轮硬上限：第 4 轮打完即收场（每次 advanceRound 代表一轮打完）。
  if (state.roundsCompleted >= COMBAT_ROUND_CAP) {
    // 超时结束整场，不以追加阶段绕过上限。
    state.over = true
    state.outcome = 'stalemate'
    notes.push(
      `已达 ${COMBAT_ROUND_CAP} 轮硬上限，强制 stalemate。` +
      '由 GM 用局势转折收场：增援、撤离、地形变化、目标改变。',
    )
    return { round: state.round, phase: state.phase, over: true, outcome: 'stalemate', forceStalemate: true, notes }
  }

  const boss = state.enemies.find((e) => e.threat === 3)
  const ratio = boss?.max_hp > 0 ? boss.hp / boss.max_hp : 1
  const nextPhase = state.phases >= 3 && ratio <= 0.25 ? 3 : state.phases >= 2 && ratio <= 0.5 ? 2 : 1
  if (nextPhase > state.phase) {
    state.phase = nextPhase
    state.round = 1
    state.roundsCompleted = 0
    notes.push(`HP 阈值触发阶段 ${nextPhase}；共用总 HP，不回血`)
    return { round: state.round, phase: state.phase, over: false, outcome: null, forceStalemate: false, notes }
  }

  state.round += 1
  return { round: state.round, phase: state.phase, over: false, outcome: null, forceStalemate: false, notes }
}

/** 一轮的行动顺序（按先攻降序，同先攻时我方优先）。 */
export function turnOrder(state) {
  return [...state.order].sort((a, b) => (b.initiative - a.initiative) || (a.side === 'party' ? -1 : 1))
}

function qualityBonus(quality) {
  return { 1: 0, 2: 5, 3: 10, 4: 20, 5: 35 }[quality] ?? 0
}
