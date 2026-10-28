/**
 * 骰点与判定内核。
 *
 * 核心设计（来自 finalized-stat-rules-v1.0.md 第一节）：
 * - **档位看合计值**，大成功/大失败**看裸骰**。
 * - 裸骰 2（骰面双 1）= 大失败；裸骰 12（骰面双 6）= 大成功。
 * - 两者对称，各 2.8%，**都不可被属性或装备购买**。
 *
 * 为什么必须这样：若大成功也按合计值判定，属性 −1 时需合计 ≥12 而骰面最大只有 12，
 * 大成功概率会变成 0%——低属性角色永远等不到高光时刻。反之高属性会让大成功通货膨胀。
 */

import { rollDice, rollDiceWith } from './rng.js'

/** 判定档位。 */
export const TIER = Object.freeze({
  CRITICAL_FAILURE: 'critical_failure',
  FAILURE: 'failure',
  SUCCESS_COST: 'success_cost',
  SUCCESS: 'success',
  CRITICAL_SUCCESS: 'critical_success',
})

/** 档位的中文显示名。 */
export const TIER_LABEL = Object.freeze({
  [TIER.CRITICAL_FAILURE]: '大失败',
  [TIER.FAILURE]: '失败',
  [TIER.SUCCESS_COST]: '成功，但有代价',
  [TIER.SUCCESS]: '成功',
  [TIER.CRITICAL_SUCCESS]: '大成功',
})

/** 档位的叙事指引（GM 按此推进局势）。 */
export const TIER_GUIDANCE = Object.freeze({
  [TIER.CRITICAL_FAILURE]: '严重后果，但不直接死亡；依据事前风险与当前行动结算，不临时追加无关损失。',
  [TIER.FAILURE]: '本次目标未达成，按事前风险与既有因果落实后果；不原样重掷，不改成无关惩罚。',
  [TIER.SUCCESS_COST]: '本次目标达成，落实事前可预见的代价；达到任务目标时正常收束，不用新疑点抵消成功。',
  [TIER.SUCCESS]: '本次目标达成，兑现结果；若已解决当前任务就收束并交代回报与后果，不强加新选择或追加任务。',
  [TIER.CRITICAL_SUCCESS]: '本次目标达成并获得合理额外收益；达到任务目标时正常收束。',
})

/** 失败的合计上限（含）。 */
export const FAILURE_MAX = 6
/** 「成功带代价」的合计区间上限（含）。 */
export const SUCCESS_COST_MAX = 9
/** 「成功」的合计区间上限（含）。 */
export const SUCCESS_MAX = 11
/** 大失败的裸骰值。 */
export const CRIT_FAIL_NATURAL = 2
/** 大成功的裸骰值。 */
export const CRIT_SUCCESS_NATURAL = 12

/** 骰子表达式，如 `2d6`、`d6`、`3d6+1`、`2d6-2`、`1d6+1d6`。 */
const DICE_TERM = /^(\d*)d(\d+)([+-]\d+)?$/

/**
 * 解析一个骰子表达式。
 *
 * 支持：`NdM`、`NdM+K`、`NdM-K`、`dM`（等同 `1dM`）、以及用 `+` 连接的多个骰项（如 `1d6+1d6`）。
 * 不支持括号、乘除、以及 `KdM` 形式的多次取高——本系统不需要。
 *
 * @param {string} expr - 表达式，允许含空格。
 * @returns {{ terms: Array<{count: number, faces: number}>, modifier: number }}
 * @throws {Error} 表达式非法时抛出。
 */
export function parseDiceExpression(expr) {
  if (typeof expr !== 'string' || expr.trim() === '') {
    throw new Error('parseDiceExpression: 表达式必须是非空字符串')
  }
  const cleaned = expr.replace(/\s+/g, '').toLowerCase()
  const terms = []
  let modifier = 0

  // 先按 + 切分，再逐段判断是骰项还是常数项。
  const segments = cleaned.split('+')
  for (const segment of segments) {
    if (segment === '') throw new Error(`parseDiceExpression: 表达式非法：${expr}`)

    // 常数项（可能是负数形式，如 "2d6+-1" 已在规范化中排除；这里处理纯数字与 -数字）
    if (/^-?\d+$/.test(segment)) {
      modifier += Number(segment)
      continue
    }

    // 骰项，可能带负修正：2d6-2
    const m = DICE_TERM.exec(segment)
    if (m === null) {
      throw new Error(`parseDiceExpression: 无法解析的骰项「${segment}」（完整表达式：${expr}）`)
    }
    const count = m[1] === '' ? 1 : Number(m[1])
    const faces = Number(m[2])
    if (count < 1) throw new Error(`parseDiceExpression: 骰子数量必须 ≥1：${segment}`)
    if (faces < 2) throw new Error(`parseDiceExpression: 骰面数必须 ≥2：${segment}`)
    if (m[3] !== undefined) modifier += Number(m[3])
    terms.push({ count, faces })
  }

  if (terms.length === 0) {
    throw new Error(`parseDiceExpression: 表达式中没有骰项：${expr}`)
  }
  return { terms, modifier }
}

/**
 * 按给定随机源掷一个骰子表达式。
 *
 * @param {string} expr - 表达式。
 * @param {(faces: number) => number} [faceRoller] - 可选：掷一个 N 面骰。默认用强随机 d6；
 *   传入自定义函数时**只支持 d6**（本系统的所有骰都是 d6）。
 * @returns {{ expr: string, dice: number[], raw: number, modifier: number, total: number, natural: number|null }}
 *   `natural` 仅在「恰好两个 d6」时给出裸骰合计（用于大成功/大失败判定），否则为 `null`。
 */
export function rollExpression(expr, faceRoller) {
  const { terms, modifier } = parseDiceExpression(expr)
  const dice = []
  for (const term of terms) {
    if (term.faces !== 6 && faceRoller !== undefined) {
      throw new Error('rollExpression: 注入随机源时只支持 d6')
    }
    if (faceRoller === undefined) {
      dice.push(...rollDice(term.count))
    } else {
      for (let i = 0; i < term.count; i += 1) dice.push(faceRoller(term.faces))
    }
  }
  const raw = dice.reduce((a, b) => a + b, 0)
  return {
    expr,
    dice,
    raw,
    modifier,
    total: raw + modifier,
    natural: dice.length === 2 && terms.length === 1 && terms[0].faces === 6 ? raw : null,
  }
}

/**
 * 按裸骰与合计值判定档位。
 *
 * 顺序很重要：**先判裸骰的大成功/大失败**，再按合计值分档。
 *
 * @param {number} total - 合计值（含全部修正）。
 * @param {number|null} natural - 裸骰合计；非「恰好 2d6」时传 `null`。
 * @returns {string} 档位常量。
 */
export function resolveTier(total, natural) {
  if (natural === CRIT_FAIL_NATURAL) return TIER.CRITICAL_FAILURE
  if (natural === CRIT_SUCCESS_NATURAL) return TIER.CRITICAL_SUCCESS
  if (total <= FAILURE_MAX) return TIER.FAILURE
  if (total <= SUCCESS_COST_MAX) return TIER.SUCCESS_COST
  if (total <= SUCCESS_MAX) return TIER.SUCCESS
  return TIER.SUCCESS
}

/**
 * 一次完整判定的修正构成。
 *
 * `tagIds` / `gearBonus` / `circumstance` / `difficulty` 都由**引擎**查卡与查表得出，
 * 不接受模型（AI GM）直接传入的汇总值——这是防止 AI 悄悄给自己加值的关键。
 *
 * @typedef {object} CheckModifiers
 * @property {number} attribute - 属性修正（来自角色卡）。
 * @property {number} [tag] - 标签修正（单次检定最多 1 个标签，取值 −1 / 0 / +1）。
 * @property {number} [gear] - 装备修正（整套合计，上限 +1）。
 * @property {number} [circumstance] - 处境修正（叙事优势/劣势，±1）。
 * @property {number} [difficulty] - 难度修正（容易 +1 / 普通 0 / 困难 −2 / 极难 −4）。
 */

/**
 * 执行一次 2d6 判定。
 *
 * @param {CheckModifiers} mods - 修正构成。
 * @param {() => number} [d6Source] - 可选：注入的 d6 随机源（测试用，序列长度必须是 2）。
 * @returns {{
 *   dice: number[], natural: number, total: number, tier: string, tierLabel: string,
 *   guidance: string, breakdown: { attribute: number, tag: number, gear: number, circumstance: number, difficulty: number, sum: number, capped: boolean }
 * }}
 */
export function check(mods, d6Source) {
  const attribute = num(mods?.attribute, 'attribute')
  const tag = num(mods?.tag, 0)
  const gear = num(mods?.gear, 0)
  const circumstance = num(mods?.circumstance, 0)
  const difficulty = num(mods?.difficulty, 0)

  if (tag < -1 || tag > 1) throw new Error(`check: 标签修正必须在 −1..+1，收到 ${tag}`)
  if (gear < 0) throw new Error(`check: 装备修正不可为负，收到 ${gear}`)

  const raw = sum([attribute, tag, gear, circumstance, difficulty])
  const capped = raw > MAX_TOTAL_MODIFIER
  const effective = capped ? MAX_TOTAL_MODIFIER : raw

  const dice = d6Source === undefined ? rollDice(2) : rollDiceWith(2, d6Source)
  const natural = dice[0] + dice[1]
  const total = natural + effective
  const tier = resolveTier(total, natural)

  return {
    dice,
    natural,
    total,
    tier,
    tierLabel: TIER_LABEL[tier],
    guidance: TIER_GUIDANCE[tier],
    breakdown: {
      attribute,
      tag,
      gear,
      circumstance,
      difficulty,
      sum: raw,
      capped,
    },
  }
}

/** 单次检定的总修正上限（数值定稿v1.0 §1.2）。 */
export const MAX_TOTAL_MODIFIER = 5

/** 数值定稿v1.0 §1.2 的修正天花板。 */
export const CAPS = Object.freeze({
  /** 属性：建卡 −1..+2，成长上限 +3。 */
  attributeMin: -1,
  attributeBuildMax: 2,
  attributeGrowthMax: 3,
  /** 标签：单次检定最多用 1 个，每个取值 ±1。 */
  tagsPerCheck: 1,
  tagModifierMin: -1,
  tagModifierMax: 1,
  /** 装备：整套合计上限 +1。 */
  gearMax: 1,
  /** 处境：±1。 */
  circumstanceMin: -1,
  circumstanceMax: 1,
  /** 单次检定总修正上限。 */
  totalMax: MAX_TOTAL_MODIFIER,
})

/** 难度修正表（数值定稿v1.0 §1.3）。 */
export const DIFFICULTY = Object.freeze({
  容易: 1,
  普通: 0,
  困难: -2,
  极难: -4,
})

function sum(nums) {
  return nums.reduce((a, b) => a + b, 0)
}

function num(value, fallback) {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`check: 修正值必须是有限数字，收到 ${JSON.stringify(value)}`)
  }
  return value
}
